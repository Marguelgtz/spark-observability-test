import type { AccountV1 } from '@spark/dashboard-contracts';
import {
  buildGitHubUserAuthorizationUrl,
  exchangeGitHubUserCode,
  GitHubUserClient,
} from '@spark/github';
import type { DashboardAuthorizer, DashboardPrincipal } from './dashboard-access';
import type { D1Database } from './d1';

const SESSION_COOKIE = 'spark_session';
const OAUTH_STATE_COOKIE = 'spark_oauth_state';
const OAUTH_VERIFIER_COOKIE = 'spark_oauth_verifier';
const OAUTH_RETURN_COOKIE = 'spark_oauth_return';
const SESSION_SECONDS = 8 * 60 * 60;
const OAUTH_SECONDS = 10 * 60;
const MAX_AUTHORIZED_REPOSITORIES = 5_000;

export interface GitHubAuthEnv {
  DB: D1Database;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_APP_SLUG?: string;
  SPARK_PUBLIC_ORIGIN?: string;
}

interface SessionRow {
  github_user_id: number;
  login: string;
  avatar_url: string;
  repository_ids_json: string;
  installation_ids_json: string;
  expires_at: string;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return base64Url(bytes);
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get('cookie');
  if (!cookie) return undefined;
  for (const part of cookie.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) return decodeURIComponent(rawValue.join('='));
  }
  return undefined;
}

function cookie(name: string, value: string, request: Request, maxAge: number, path = '/'): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAge}`;
}

function clearCookie(name: string, request: Request, path = '/'): string {
  return cookie(name, '', request, 0, path);
}

function safeReturnTo(value: string | null | undefined): string {
  if (!value) return '/app';
  if (!value.startsWith('/app') || value.startsWith('//') || value.includes('\r') || value.includes('\n')) return '/app';
  return value;
}

function publicOrigin(request: Request, env: GitHubAuthEnv): string {
  if (env.SPARK_PUBLIC_ORIGIN) {
    const configured = new URL(env.SPARK_PUBLIC_ORIGIN);
    return configured.origin;
  }
  return new URL(request.url).origin;
}

function parseIdArray(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is number => Number.isSafeInteger(item) && item > 0);
  } catch {
    return [];
  }
}

function redirect(location: string, headers: string[] = []): Response {
  const responseHeaders = new Headers({ location, 'cache-control': 'no-store' });
  for (const value of headers) responseHeaders.append('set-cookie', value);
  return new Response(null, { status: 302, headers: responseHeaders });
}

export class GitHubDashboardAuth implements DashboardAuthorizer {
  constructor(
    private readonly env: GitHubAuthEnv,
    private readonly fetcher: typeof fetch = (request, init) => globalThis.fetch(request, init),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async upsertUser(user: { id: number; login: string; avatar_url: string }): Promise<void> {
    await this.env.DB.prepare(
      `INSERT INTO dashboard_users (github_user_id, login, avatar_url)
       VALUES (?, ?, ?)
       ON CONFLICT(github_user_id) DO UPDATE SET
         login = excluded.login,
         avatar_url = excluded.avatar_url,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(user.id, user.login, user.avatar_url).run();
  }

  private async createSession(input: {
    userId: number;
    repositoryIds: number[];
    installationIds: number[];
  }): Promise<{ token: string; expiresAt: string }> {
    const token = randomToken();
    const sessionHash = await sha256(token);
    const expiresAt = new Date(this.now().getTime() + SESSION_SECONDS * 1000).toISOString();
    const nowIso = this.now().toISOString();
    await this.env.DB.prepare('DELETE FROM dashboard_sessions WHERE expires_at <= ?').bind(nowIso).run();
    await this.env.DB.prepare(
      `INSERT INTO dashboard_sessions
       (session_hash, github_user_id, repository_ids_json, installation_ids_json, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      sessionHash,
      input.userId,
      JSON.stringify(input.repositoryIds),
      JSON.stringify(input.installationIds),
      expiresAt,
    ).run();
    return { token, expiresAt };
  }

  async authorize(request: Request): Promise<DashboardPrincipal | undefined> {
    const token = cookieValue(request, SESSION_COOKIE);
    if (!token) return undefined;
    const sessionHash = await sha256(token);
    const nowIso = this.now().toISOString();
    const row = await this.env.DB.prepare(
      `SELECT s.github_user_id, u.login, u.avatar_url,
              s.repository_ids_json, s.installation_ids_json, s.expires_at
       FROM dashboard_sessions s
       JOIN dashboard_users u ON u.github_user_id = s.github_user_id
       WHERE s.session_hash = ? AND s.expires_at > ?`,
    ).bind(sessionHash, nowIso).first<SessionRow>();
    if (!row) return undefined;
    return {
      viewer: { version: 1, id: row.github_user_id, login: row.login, avatarUrl: row.avatar_url },
      repositoryIds: parseIdArray(row.repository_ids_json),
      installationIds: parseIdArray(row.installation_ids_json),
      sessionExpiresAt: row.expires_at,
    };
  }

  async start(request: Request): Promise<Response> {
    const clientId = this.env.GITHUB_CLIENT_ID;
    const clientSecret = this.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return new Response('GitHub authentication is not configured', { status: 503 });
    }
    const url = new URL(request.url);
    const returnTo = safeReturnTo(url.searchParams.get('return_to'));
    const state = randomToken();
    const verifier = randomToken();
    const challenge = await sha256(verifier);
    const redirectUri = `${publicOrigin(request, this.env)}/auth/github/callback`;
    const authorizationUrl = buildGitHubUserAuthorizationUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge: challenge,
    });
    return redirect(authorizationUrl, [
      cookie(OAUTH_STATE_COOKIE, state, request, OAUTH_SECONDS, '/auth/github'),
      cookie(OAUTH_VERIFIER_COOKIE, verifier, request, OAUTH_SECONDS, '/auth/github'),
      cookie(OAUTH_RETURN_COOKIE, returnTo, request, OAUTH_SECONDS, '/auth/github'),
    ]);
  }

  async callback(request: Request): Promise<Response> {
    const clientId = this.env.GITHUB_CLIENT_ID;
    const clientSecret = this.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return new Response('GitHub authentication is not configured', { status: 503 });
    }
    const url = new URL(request.url);
    const returnTo = safeReturnTo(cookieValue(request, OAUTH_RETURN_COOKIE));
    const clearOAuth = [
      clearCookie(OAUTH_STATE_COOKIE, request, '/auth/github'),
      clearCookie(OAUTH_VERIFIER_COOKIE, request, '/auth/github'),
      clearCookie(OAUTH_RETURN_COOKIE, request, '/auth/github'),
    ];
    if (url.searchParams.get('error')) return redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}auth=denied`, clearOAuth);

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const expectedState = cookieValue(request, OAUTH_STATE_COOKIE);
    const verifier = cookieValue(request, OAUTH_VERIFIER_COOKIE);
    if (!code || !state || !expectedState || state !== expectedState || !verifier) {
      return new Response('Invalid or expired GitHub authorization state', { status: 400, headers: { 'cache-control': 'no-store' } });
    }

    const redirectUri = `${publicOrigin(request, this.env)}/auth/github/callback`;
    const token = await exchangeGitHubUserCode({
      clientId,
      clientSecret,
      code,
      redirectUri,
      codeVerifier: verifier,
    }, this.fetcher);
    const snapshot = await new GitHubUserClient(token.access_token, this.fetcher).accessSnapshot();
    if (snapshot.repositories.length > MAX_AUTHORIZED_REPOSITORIES) {
      return new Response('GitHub account has too many repositories to authorize safely', { status: 413 });
    }

    await this.upsertUser(snapshot.user);
    const repositoryIds = snapshot.repositories.map(repository => repository.id);
    const session = await this.createSession({
      userId: snapshot.user.id,
      repositoryIds,
      installationIds: snapshot.installationIds,
    });
    return redirect(returnTo, [
      ...clearOAuth,
      cookie(SESSION_COOKIE, session.token, request, SESSION_SECONDS),
    ]);
  }

  async logout(request: Request): Promise<Response> {
    const token = cookieValue(request, SESSION_COOKIE);
    if (token) {
      const sessionHash = await sha256(token);
      await this.env.DB.prepare('DELETE FROM dashboard_sessions WHERE session_hash = ?').bind(sessionHash).run();
    }
    const headers = new Headers({ 'cache-control': 'no-store' });
    headers.append('set-cookie', clearCookie(SESSION_COOKIE, request));
    return new Response(null, { status: 204, headers });
  }

  account(principal: DashboardPrincipal): AccountV1 {
    const slug = this.env.GITHUB_APP_SLUG;
    return {
      version: 1,
      viewer: principal.viewer,
      repositoryCount: principal.repositoryIds.length,
      installationCount: principal.installationIds.length,
      sessionExpiresAt: principal.sessionExpiresAt,
      githubInstallUrl: slug ? `https://github.com/apps/${encodeURIComponent(slug)}/installations/new` : 'https://github.com/settings/installations',
      githubSettingsUrl: 'https://github.com/settings/installations',
    };
  }
}
