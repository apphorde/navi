# Navi

Navi is a browser-based text-file explorer and editor with an optional AI assistant. The server stores workspace files under `DATA_ROOT` and application settings and audit events in a SQLite database under `NAVI_ROOT`.

## Requirements

- Node.js 24 or newer
- pnpm 10
- An OIDC client registered with the configured authentication provider

The browser also loads `@li3/web` from `cdn.li3.dev` and editor, code-block, and icon components from `sodium.static.apphor.de`.

## Run locally

Install dependencies and build the stylesheet:

```sh
pnpm install --frozen-lockfile
pnpm build:css
```

Set the required authentication values, then start the server:

```sh
export AUTH_PROVIDER=https://auth.api.apphor.de
export OIDC_CLIENT_ID=your-client-id
export OIDC_CLIENT_SECRET=your-client-secret
pnpm dev
```

The app listens on port `3000` by default. `pnpm start` runs it without the development file watcher. The server discovers the OIDC provider and loads its Node API client at startup, so the configured provider must be reachable.

Register the callback URI for the URL users will visit, such as `https://navi.example.test/auth/callback` in production or `http://localhost:3000/auth/callback` for local development.

## Configuration

| Variable             | Default                     | Purpose                                                                                                                                                                                                                |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`               | `3000`                      | HTTP listen port.                                                                                                                                                                                                      |
| `AUTH_PROVIDER`      | Required                    | OIDC issuer URL.                                                                                                                                                                                                       |
| `OIDC_CLIENT_ID`     | Required                    | OIDC client identifier.                                                                                                                                                                                                |
| `OIDC_CLIENT_SECRET` | Required                    | OIDC client secret.                                                                                                                                                                                                    |
| `DATA_ROOT`          | `/home/app/data`            | Shared workspace files.                                                                                                                                                                                                |
| `NAVI_ROOT`          | `/home/app/navi`            | SQLite database and application state.                                                                                                                                                                                 |
| `SESSION_SECRET`     | Random per process          | Cookie-signing secret. Set a high-entropy value when a stable secret is needed. Sessions themselves are held in process memory and are lost on restart; run one server instance unless session storage is made shared. |
| `PUBLIC_ORIGIN`      | Request-derived             | Public HTTP(S) origin, without a path, query, or fragment. Set this behind ingress when forwarded headers do not reliably report the browser-facing origin; OIDC callback and logout URLs use this value.              |
| `TRUST_PROXY`        | `false`                     | Set to `true` only behind a trusted proxy that removes client-supplied forwarding headers and sets its own `Forwarded` or `X-Forwarded-*` headers.                                                                     |
| `AI_BASE_URL`        | Disabled                    | OpenAI-compatible API base URL.                                                                                                                                                                                        |
| `AI_API_KEY`         | Optional                    | Credential for the configured AI endpoint.                                                                                                                                                                             |
| `AI_MODEL`           | Required when AI is enabled | Model name sent to the AI endpoint.                                                                                                                                                                                    |

`compose.yml` provides defaults for the Auth issuer and AI variables. It mounts `./data` as the shared workspace and `./navi` as application state. Keep these directories private and backed up appropriately. The database and workspace are local to the server; every authenticated user can access the same workspace, with no per-user file isolation.

Use HTTPS in production. Session cookies are marked `Secure`. For example, set `PUBLIC_ORIGIN=https://navi.lab.apphor.de` when the public origin is not reliably available from the ingress request. Register the exact callback URI `https://navi.lab.apphor.de/auth/callback` with the OIDC provider. When deploying behind a reverse proxy without `PUBLIC_ORIGIN`, configure `TRUST_PROXY=true` only if the proxy is trusted to sanitize forwarded headers.

## AI and privacy

When AI is enabled, Navi sends the selected file's content and the user's question to the configured AI endpoint. The assistant is intended to be read-only, but its system prompt is editable and stored in the local SQLite database. Configure an endpoint whose data handling is appropriate for the workspace. The server limits file content to 1 MiB and questions to 16,000 bytes per request.

## Checks

```sh
pnpm test
pnpm check
pnpm lint
pnpm build:css
```

`pnpm build:css` regenerates the checked-in `public/app.css` from `src/tailwind.css` and the classes in `public/`.
