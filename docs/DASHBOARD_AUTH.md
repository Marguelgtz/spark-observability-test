# Dashboard authentication

Spark uses two separate GitHub application identities.

- **spark-auth OAuth App** answers: who is this dashboard user?
- **Spark Observability GitHub App** answers: which Spark installations and repositories may that user see?

The OAuth App token is never used to authorize access to Spark repository data.

## Production flow

1. `/app` calls `GET /api/me`.
2. An unauthenticated response renders **Sign in with GitHub**.
3. `/auth/github` creates random OAuth `state` and a PKCE verifier/challenge and redirects to GitHub using `GITHUB_AUTH_CLIENT_ID`.
4. GitHub returns to `/auth/github/callback`.
5. Spark validates `state`, exchanges the temporary code with the PKCE verifier, and receives a `spark-auth` OAuth App token (`gho_`).
6. Spark uses that OAuth token only for `GET /user`, establishing the stable GitHub user ID/login/avatar.
7. Spark loads repository candidates already known from the `installations` and `repositories` tables populated by Spark Observability webhooks.
8. For each relevant Spark Observability installation, Spark creates an installation token using `GITHUB_APP_ID` + `GITHUB_PRIVATE_KEY`.
9. Spark checks the authenticated user's effective repository permission with the installation token. User-owned installations are accepted directly by stable GitHub account ID; organization/other-account repositories use GitHub's collaborator permission endpoint.
10. The authorized repository set is therefore the intersection: **repositories where Spark is installed AND repositories the GitHub user can access**.
11. Both GitHub tokens are discarded. Spark stores only the GitHub identity, authorized installation/repository IDs, and a SHA-256 hash of a random Spark session token.
12. The browser receives the opaque Spark session token in an HttpOnly, SameSite=Lax, Secure cookie in production.

Sessions expire after 8 hours. **Refresh GitHub access** runs the identity and authorization resolution again and creates a fresh access snapshot/session.

## Why the split exists

A normal OAuth App token cannot call `GET /user/installations` for a different GitHub App. Rather than giving the OAuth App the broad `repo` scope, Spark keeps `spark-auth` identity-only and uses Spark Observability installation tokens to verify effective repository access.

This also makes the account layer independent from the repository integration. Later, the identity layer can support additional providers without changing how Spark Observability authenticates to GitHub repositories.

## OAuth App configuration (`spark-auth`)

Configure this callback URL on the **spark-auth OAuth App**:

```text
https://spark-api.marguel-gtz.workers.dev/auth/github/callback
```

Set its credentials as Worker secrets:

```bash
cd apps/api
pnpm exec wrangler secret put GITHUB_AUTH_CLIENT_ID
pnpm exec wrangler secret put GITHUB_AUTH_CLIENT_SECRET
```

For the current production OAuth App, `GITHUB_AUTH_CLIENT_ID` is the `Ov...` client ID. Do not put the Spark Observability GitHub App client ID in this variable.

No `repo` OAuth scope is required by the current dashboard flow. The OAuth token is used only for GitHub user identity.

## GitHub App configuration (`Spark Observability`)

Repository integration continues to use:

```text
GITHUB_APP_ID
GITHUB_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET
GITHUB_APP_SLUG
```

The GitHub App's `Iv...` client ID may be kept in local configuration as `GITHUB_APP_CLIENT_ID` for clarity/diagnostics, but the split dashboard flow does not need its client secret. Server-to-server GitHub App authentication uses the numeric App ID and private key.

The GitHub App no longer needs its user-OAuth callback for dashboard login. Its installation/webhook configuration remains unchanged.

## Local `.dev.vars`

Use distinct names so the identities cannot be mixed accidentally:

```dotenv
# Spark Observability GitHub App
GITHUB_APP_ID="..."
GITHUB_APP_CLIENT_ID="Iv..."
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET="..."
GITHUB_APP_SLUG="spark-observability"

# spark-auth OAuth App
GITHUB_AUTH_CLIENT_ID="Ov..."
GITHUB_AUTH_CLIENT_SECRET="..."

SPARK_CONTACT_EMAIL="..."
SPARK_PUBLIC_ORIGIN="https://spark-api.marguel-gtz.workers.dev"
```

`GITHUB_APP_CLIENT_ID` is descriptive in the current implementation; Wrangler's required production secrets are the credentials actually used at runtime.

## Authorization data source

`D1SparkStore.saveInstallationEvent` keeps the `installations` and `repositories` tables synchronized from GitHub App installation webhooks. Dashboard login treats those rows as candidates only, never as proof that the user is authorized. GitHub is queried with an installation token before organization/other-account repository IDs are placed in a Spark session.

A stale repository name fails closed: GitHub returns no permission and the repository is not added to the session. Unexpected GitHub authorization errors fail the callback rather than granting access.

The current V0 resolver checks known Spark repositories at login. At substantially larger installation counts, replace global candidate discovery with persisted user-to-installation links or another indexed candidate strategy while keeping the same final permission verification boundary.

## Deploy

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate:remote
pnpm run deploy
```

`pnpm run deploy` first builds `apps/web`, then deploys `apps/api` with the Vite output as Cloudflare Worker static assets. This keeps `/app`, `/api/*`, and `/auth/*` on the same origin.

## Security boundaries

- `spark-auth` proves identity; it does not grant Spark repository access.
- Spark Observability installation tokens prove the App side of repository access.
- Organization/other-account repositories require a positive GitHub effective-permission result for the authenticated user.
- User-owned installations are matched by stable GitHub numeric account ID, not login text.
- OAuth and installation tokens are not persisted.
- Spark session IDs are not stored in plaintext; D1 stores SHA-256 hashes.
- OAuth uses random `state` plus PKCE S256.
- Session cookies are HttpOnly and SameSite=Lax, and Secure on HTTPS.
- Requests for repository IDs outside the session authorization snapshot return 404.
- Sign-out deletes the server session and clears the session cookie.
