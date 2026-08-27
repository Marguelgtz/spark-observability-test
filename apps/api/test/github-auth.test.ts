import { describe, expect, it, vi } from 'vitest';
import type { D1AllResult, D1Database, D1PreparedStatement, D1Result } from '../src/d1';
import { GitHubDashboardAuth } from '../src/github-auth';

interface UserRow { github_user_id: number; login: string; avatar_url: string }
interface SessionRow {
  session_hash: string;
  github_user_id: number;
  repository_ids_json: string;
  installation_ids_json: string;
  expires_at: string;
}

class MemoryStatement implements D1PreparedStatement {
  private values: unknown[] = [];
  constructor(private readonly database: MemoryDatabase, private readonly query: string) {}
  bind(...values: unknown[]): D1PreparedStatement { this.values = values; return this; }
  async run(): Promise<D1Result> {
    if (this.query.includes('INSERT INTO dashboard_users')) {
      const [id, login, avatar] = this.values as [number, string, string];
      this.database.users.set(id, { github_user_id: id, login, avatar_url: avatar });
      return { meta: { changes: 1 } };
    }
    if (this.query.includes('INSERT INTO dashboard_sessions')) {
      const [hash, userId, repositories, installations, expiresAt] = this.values as [string, number, string, string, string];
      this.database.sessions.set(hash, {
        session_hash: hash,
        github_user_id: userId,
        repository_ids_json: repositories,
        installation_ids_json: installations,
        expires_at: expiresAt,
      });
      return { meta: { changes: 1 } };
    }
    if (this.query.includes('DELETE FROM dashboard_sessions WHERE session_hash')) {
      this.database.sessions.delete(String(this.values[0]));
      return { meta: { changes: 1 } };
    }
    if (this.query.includes('DELETE FROM dashboard_sessions WHERE expires_at')) {
      const cutoff = String(this.values[0]);
      for (const [hash, session] of this.database.sessions) {
        if (session.expires_at <= cutoff) this.database.sessions.delete(hash);
      }
      return { meta: { changes: 0 } };
    }
    return { meta: { changes: 0 } };
  }
  async first<T>(): Promise<T | null> {
    if (!this.query.includes('FROM dashboard_sessions s')) return null;
    const [hash, now] = this.values as [string, string];
    const session = this.database.sessions.get(hash);
    if (!session || session.expires_at <= now) return null;
    const user = this.database.users.get(session.github_user_id);
    if (!user) return null;
    return {
      github_user_id: user.github_user_id,
      login: user.login,
      avatar_url: user.avatar_url,
      repository_ids_json: session.repository_ids_json,
      installation_ids_json: session.installation_ids_json,
      expires_at: session.expires_at,
    } as T;
  }
  async all<T>(): Promise<D1AllResult<T>> { return { results: [] }; }
}

class MemoryDatabase implements D1Database {
  users = new Map<number, UserRow>();
  sessions = new Map<string, SessionRow>();
  prepare(query: string): D1PreparedStatement { return new MemoryStatement(this, query); }
  async batch(): Promise<D1Result[]> { return []; }
}

function responseCookie(response: Response, name: string): string {
  const header = response.headers.get('set-cookie') ?? '';
  const match = header.match(new RegExp(`${name}=([^;,]+)`));
  if (!match) throw new Error(`Missing ${name} cookie in ${header}`);
  return match[1];
}

describe('GitHub dashboard authentication', () => {
  it('uses state + PKCE, creates an opaque server session, and discards the GitHub token', async () => {
    const db = new MemoryDatabase();
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.origin === 'https://github.com' && url.pathname === '/login/oauth/access_token') {
        return new Response(JSON.stringify({ access_token: 'ghu_ephemeral', expires_in: 28_800 }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.pathname === '/user') {
        return new Response(JSON.stringify({ id: 7, login: 'marguel', avatar_url: 'https://avatars.example/7' }));
      }
      if (url.pathname === '/user/installations') {
        return new Response(JSON.stringify({ total_count: 1, installations: [{ id: 11 }] }));
      }
      if (url.pathname === '/user/installations/11/repositories') {
        return new Response(JSON.stringify({ total_count: 2, repositories: [
          { id: 101, full_name: 'acme/one', name: 'one', owner: { login: 'acme' } },
          { id: 102, full_name: 'acme/two', name: 'two', owner: { login: 'acme' } },
        ] }));
      }
      return new Response('not found', { status: 404 });
    });
    const auth = new GitHubDashboardAuth({
      DB: db,
      GITHUB_CLIENT_ID: 'Iv1.test',
      GITHUB_CLIENT_SECRET: 'secret',
      GITHUB_APP_SLUG: 'spark-observability',
    }, fetcher as typeof fetch, () => new Date('2026-08-27T20:00:00.000Z'));

    const started = await auth.start(new Request('https://spark.test/auth/github?return_to=%2Fapp%2Faccount'));
    expect(started.status).toBe(302);
    const location = new URL(started.headers.get('location')!);
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');

    const state = decodeURIComponent(responseCookie(started, 'spark_oauth_state'));
    const verifier = decodeURIComponent(responseCookie(started, 'spark_oauth_verifier'));
    const returnTo = responseCookie(started, 'spark_oauth_return');
    const callback = await auth.callback(new Request(`https://spark.test/auth/github/callback?code=code&state=${encodeURIComponent(state)}`, {
      headers: { cookie: `spark_oauth_state=${state}; spark_oauth_verifier=${verifier}; spark_oauth_return=${returnTo}` },
    }));

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/app/account');
    expect(db.users.get(7)?.login).toBe('marguel');
    expect(db.sessions.size).toBe(1);
    const persisted = [...db.sessions.values()][0];
    expect(persisted.repository_ids_json).toBe('[101,102]');
    expect(JSON.stringify(persisted)).not.toContain('ghu_ephemeral');

    const sessionToken = decodeURIComponent(responseCookie(callback, 'spark_session'));
    const principal = await auth.authorize(new Request('https://spark.test/api/me', {
      headers: { cookie: `spark_session=${sessionToken}` },
    }));
    expect(principal).toMatchObject({
      viewer: { id: 7, login: 'marguel' },
      repositoryIds: [101, 102],
      installationIds: [11],
    });

    const loggedOut = await auth.logout(new Request('https://spark.test/auth/logout', {
      method: 'POST',
      headers: { cookie: `spark_session=${sessionToken}` },
    }));
    expect(loggedOut.status).toBe(204);
    expect(db.sessions.size).toBe(0);
  });

  it('rejects a callback when state does not match the HttpOnly OAuth cookie', async () => {
    const auth = new GitHubDashboardAuth({
      DB: new MemoryDatabase(),
      GITHUB_CLIENT_ID: 'Iv1.test',
      GITHUB_CLIENT_SECRET: 'secret',
    });
    const response = await auth.callback(new Request('https://spark.test/auth/github/callback?code=code&state=attacker', {
      headers: { cookie: 'spark_oauth_state=expected; spark_oauth_verifier=verifier' },
    }));
    expect(response.status).toBe(400);
  });
});
