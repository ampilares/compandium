# Compandium

Hosted, managed **company brains** powered by [gbrain](https://github.com/garrytan/gbrain).

Companies sign up, get a private gbrain instance provisioned on Fly.io, split it into
**departments** (gbrain sources) with per-member scoped access (gbrain OAuth clients),
keep it fed with **managed connectors** (Notion, Slack, Google Drive, git, uploads,
webhooks), and query it with citations — from the web dashboard or any MCP client
(Claude Code, Cursor, Claude Desktop, OpenClaw…).

## Layout

```
apps/web               Next.js control plane: marketing + dashboard + API (Better Auth, Drizzle)
apps/worker            pg-boss background jobs: provisioning, connector syncs, health, metering
packages/db            Drizzle schema + client for the control-plane Postgres
packages/shared        crypto envelope, slugs, shared contracts
packages/tenant-image  (Phase 1) per-tenant Docker image: Postgres + gbrain + compandium-agent
packages/connectors    (Phase 4) connector contract + implementations
references/            local reference checkouts (gbrain, Vitrus) — not tracked
```

## Development

```bash
bun install
docker compose -f docker-compose.dev.yml up -d   # control-plane Postgres
cp .env.example .env                             # fill in secrets; copy to apps/web/.env.local
bun run db:migrate                               # apply Drizzle migrations
bun run dev                                      # web on :3100 + worker
```

Checks: `bun run typecheck` · `bun run test`

## Architecture (short version)

- **One gbrain instance per tenant** (gbrain is one-brain-per-process by design):
  a Fly app with one Machine + volume running Postgres+pgvector, `gbrain serve --http`
  (MCP + OAuth 2.1), and a `compandium-agent` sidecar that wraps the CLI-only
  management operations (sources, sync, client registration).
- **Department = gbrain source** (its own git repo on the tenant volume).
- **Member = gbrain OAuth client** with `--source` write scope + `--federated-read` read set;
  isolation is enforced by gbrain at the SQL layer.
- **Connectors** run in the worker, write markdown into department repos via the agent,
  then trigger a scoped sync — markdown in git stays the portable system of record.

Full plan: see the project plan file / issues.
