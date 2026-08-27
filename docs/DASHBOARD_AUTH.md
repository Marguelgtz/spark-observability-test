# Dashboard authentication

Spark dashboard authentication uses the existing GitHub App's user-to-server OAuth flow.

## Production flow

1. `/app` calls `GET /api/me`.
2. An unauthenticated response renders **Sign in with GitHub**.
3. `/auth/github` creates random OAuth `state` and a PKCE verifier/challenge and redirects to GitHub.
4. GitHub returns to `/auth/github/callback`.
5. Spark validates `state`, exchanges the temporary code with the PKCE verifier, and receives a GitHub App user access token.
6. Spark uses that token to read the GitHub user plus `GET /user/installations` and `GET /user/installations/{installation_id}/repositories`.
7. The GitHub token is discarded. Spark stores only the GitHub user identity, authorized installation/repository IDs, and a SHA-256 hash of a random Spark session token.
8. The browser receives the opaque Spark session token in an HttpOnly, SameSite=Lax, Secure cookie in production.

Sessions expire after 8 hours. **Refresh GitHub access** runs the OAuth flow again and creates a fresh access snapshot/session.

## GitHub App configuration

In the GitHub App settings, add this callback URL using the public Spark Worker origin:

```text
https://<spark-worker-origin>/auth/github/callback
```

For the current workers.dev deployment this is expected to be:

```text
https://spark-api.marguel-gtz.workers.dev/auth/github/callback
```

Set the Worker secrets from the **same GitHub App registration** used by `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY`:

```bash
cd apps/api
pnpm exec wrangler secret put GITHUB_APP_CLIENT_ID
pnpm exec wrangler secret put GITHUB_APP_CLIENT_SECRET
```

`GITHUB_APP_CLIENT_ID` is the GitHub App client ID. `GITHUB_APP_CLIENT_SECRET` is a client secret generated on that same GitHub App's settings page. Do not use credentials from a separate OAuth App.

The old `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` names are accepted temporarily as a migration fallback, but new local and production configuration should use the explicit `GITHUB_APP_*` names.

If Spark later introduces a separate account/login OAuth application, keep those credentials separate, for example `GITHUB_AUTH_CLIENT_ID` and `GITHUB_AUTH_CLIENT_SECRET`. A normal OAuth App token cannot replace the GitHub App user token used by the current `/user/installations` authorization flow.

If the Worker is reached through more than one hostname, set `SPARK_PUBLIC_ORIGIN` to the canonical origin so OAuth always uses the callback URL registered with GitHub.

## Deploy

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate:remote
pnpm run deploy
```

`pnpm run deploy` first builds `apps/web`, then deploys `apps/api` with the Vite output as Cloudflare Worker static assets. This keeps `/app`, `/api/*`, and `/auth/*` on the same origin.

## Security boundaries

- GitHub user access/refresh tokens are not persisted.
- Spark session IDs are not stored in plaintext; D1 stores SHA-256 hashes.
- OAuth uses random `state` plus PKCE S256.
- Session cookies are HttpOnly and SameSite=Lax, and Secure on HTTPS.
- Dashboard reads are restricted to repository IDs GitHub returned for the authenticated user's GitHub App installations.
- Requests for repository IDs outside the session authorization snapshot return 404.
- Sign-out deletes the server session and clears the session cookie.
