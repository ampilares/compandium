# Compandium — Technical Specifications

Companion to [PRD.md](PRD.md) (what/why) and [implementation-plan.md](implementation-plan.md) (when/how). This document specifies the system as designed; sections marked **[implemented]** exist in the repo today.

---

## 1. System overview

```
                    ┌─────────────────────────────────────────────┐
                    │ CONTROL PLANE                               │
                    │  apps/web    Next.js 16: marketing +        │
                    │              dashboard + API (Better Auth)  │
                    │  apps/worker pg-boss jobs: provisioning,    │
                    │              connector syncs, health polls, │
                    │              usage metering                 │
                    │  Postgres    control-plane DB               │
                    └───────┬─────────────────────────────────────┘
                            │ Fly Machines API (provision/destroy)
                            │ Agent API (bearer token, private net)
            ┌───────────────┼───────────────────┐
            ▼               ▼                   ▼
   ┌─ tenant app ──┐  ┌─ tenant app ──┐   One Fly app per tenant
   │ acme-brain    │  │ globex-brain  │   (<slug>-brain.fly.dev)
   │ ┌───────────┐ │  │      …        │   1 Machine + 1 volume
   │ │ postgres  │ │  └───────────────┘
   │ │ +pgvector │ │
   │ │ gbrain    │ │   Members' MCP clients (Claude Code, Cursor,
   │ │ serve http│◄┼── Desktop, OpenClaw) connect directly:
   │ │ agent     │ │   https://<slug>-brain.fly.dev/mcp + OAuth
   │ └───────────┘ │
   └───────────────┘
```

**Trust boundaries.** Public per tenant: gbrain's HTTP port only (MCP + OAuth 2.1 + `/ingest`). Private (Fly internal networking): agent port 8081 and Postgres. The control plane holds tenant admin material (agent token, bootstrap token, member client secrets) AES-256-GCM-encrypted at rest.

## 2. Load-bearing gbrain facts (verified against source, `references/gbrain` @ v0.42.57.0)

These constraints drove the architecture; re-verify on gbrain upgrades.

1. **One `gbrain serve --http` process = one brain = one database.** No multi-tenant mode (`src/core/brain-registry.ts`; mounts are local-only). → instance-per-tenant.
2. **`sources add` and `sync` are CLI-only** — no HTTP surface. → each tenant needs a management sidecar (our agent).
3. **OAuth client register/revoke over HTTP exists** (`/admin/api/register-client|revoke-client`, cookie session via bootstrap-token→magic-link) but the CLI form carries `--federated-read`; we standardize on the CLI via the agent.
4. **Sources must be git repos on disk** (content-hash idempotent sync; `docs/INSTALL.md`). Plain directories unsupported. → the agent creates local git repos per department on the tenant volume.
5. **Scoping model** (`src/commands/auth.ts`): client `--source <id>` = write authority (exactly one), `--federated-read a,b,c` = read set; enforced at the SQL layer via `sourceScopeOpts` (`src/core/operations.ts`); fail-closed (`ctx.remote !== false` = untrusted).
6. **Non-interactive init**: `gbrain init --non-interactive --url <postgres-url> [--embedding-model <id> | --no-embedding] --skip-embed-check` (`src/commands/init.ts:131-152`).
7. **Admin bootstrap token** can be supplied via `GBRAIN_ADMIN_BOOTSTRAP_TOKEN` (≥32 chars, `[A-Za-z0-9_-]+`; `src/commands/serve-http.ts:resolveBootstrapToken`). → control plane generates it and injects at provision time.
8. **`register-client` prints** `Client ID:` / `Client Secret:` lines (parsed by the agent; `src/commands/auth.ts:430-436`).
9. **Webhook ingestion**: `POST /ingest` on the serve port (rate-limited, `untrusted_payload` gated) — used by the generic webhook connector.
10. **Per-client spend**: `GET /admin/api/agents/spend` — feeds usage metering.
11. **`GET /health`** liveness on the serve port — provisioning readiness + health polls.

## 3. Tenant instance **[implemented: `packages/tenant-image`]**

One Docker image per gbrain release; one container per tenant; all state under `/data` (the Fly volume).

**Image** (`Dockerfile`): `postgres:17-bookworm` + `postgresql-17-pgvector` + Bun + gbrain cloned at build arg `GBRAIN_REF` (pinned per release) with a `/usr/local/bin/gbrain` wrapper. Entrypoint is the supervisor.

**Supervisor** (`supervisor.ts`, Bun, PID 1):
1. Validates required env: `AGENT_TOKEN`, `GBRAIN_ADMIN_BOOTSTRAP_TOKEN`, `PUBLIC_URL`.
2. `initdb` if `/data/pgdata` is empty; starts Postgres (localhost-only, via gosu); creates role `gbrain` + db `brain` + `CREATE EXTENSION vector`.
3. **First-boot bootstrap** (marker file `/data/home/.compandium-bootstrapped`): git identity; `gbrain init --non-interactive --url postgres://gbrain@127.0.0.1/brain` with `--embedding-model openai:text-embedding-3-small` when `OPENAI_API_KEY` is present, else `--no-embedding` (deferred until org adds a key); creates the `shared` department repo + `sources add` + initial sync.
4. Runs and restarts (exponential backoff) two children: `gbrain serve --http --port 8080 --bind 0.0.0.0 --public-url $PUBLIC_URL` and the agent on 8081. Postgres death exits PID 1 → Fly restarts the machine.

**Environment contract:**

| Var | Required | Purpose |
|---|---|---|
| `AGENT_TOKEN` | yes | Bearer for the agent API (control-plane generated) |
| `GBRAIN_ADMIN_BOOTSTRAP_TOKEN` | yes | gbrain admin dashboard bootstrap (≥32 chars) |
| `PUBLIC_URL` | yes | Public https URL (OAuth discovery metadata) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | no | Bundled or BYO AI keys |
| `GBRAIN_EMBEDDING_MODEL` | no | Override embedding model id |

**Upgrades:** never in-place `gbrain upgrade`; roll a new image (new `GBRAIN_REF`), soak on a staging tenant, then update machines fleet-wide. Volume data (pgdata + repos + gbrain home) survives.

**Backups:** Fly volume snapshots (daily) + department git repos are inherently re-syncable; the brain repo is the system of record (index rebuildable via sync).

## 4. Agent API **[implemented: `packages/tenant-image/agent/`]**

Private HTTP API (port 8081) wrapping CLI-only gbrain operations. Auth: `Authorization: Bearer $AGENT_TOKEN` (timing-safe compare). All slugs validated against `^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$` (path-traversal guard). Typed client: `packages/shared/src/agent-client.ts`.

| Endpoint | Backing operation |
|---|---|
| `POST /v1/departments {slug,name}` | create repo under `/data/brain-repos/<slug>` (git init + initial commit) + `gbrain sources add` |
| `GET /v1/departments` | `gbrain sources list --json` |
| `DELETE /v1/departments/:slug` | `gbrain sources remove --yes --confirm-destructive` |
| `POST /v1/sync {source?}` | `gbrain sync [--source X | --all] --no-pull --yes` (10 min timeout) |
| `POST /v1/files {source, files[{path,content|null}], message?, sync?}` | write/delete files in repo (repo-escape guarded) → `git commit` (idempotent: "nothing to commit" is OK) → scoped sync. Max 500 files/batch. **Connector delivery path.** |
| `POST /v1/members {name, source, federatedRead[]}` | `gbrain auth register-client <name> --grant-types client_credentials --scopes read,write --source X --federated-read a,b` → parses and returns `{clientId, clientSecret}` (only time the secret exists in a response) |
| `DELETE /v1/members/:clientId` | `gbrain auth revoke-client` |
| `GET /v1/health` | serve `/health` probe + `gbrain sources status --json`; 503 when serve is down |
| `GET /v1/export/:slug` | `git bundle create --all` → streamed download (no-lock-in export) |
| `GET /ping` | unauthenticated liveness |

## 5. Control plane

### 5.1 Stack **[implemented: Phase 0]**
Turborepo + Bun workspaces. `apps/web`: Next.js 16 (App Router) + Better Auth 1.3 (email/password + Google; organization plugin, one org per user) + Drizzle. `apps/worker`: Bun + pg-boss 10 (queues: `provision-instance`, `connector-sync`, `health-poll`, `meter-usage`; cron: health every 5 min, metering daily 02:10 UTC). `packages/db`: Drizzle schema + migrations. `packages/shared`: AES-256-GCM secret envelope (`CREDENTIALS_MASTER_KEY`, 32-byte base64; format `v1.<iv>.<tag>.<ct>`), slug helpers, Fly client, agent client.

### 5.2 Data model **[implemented: `packages/db/src/schema/`]**

Better Auth tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`) plus:

| Table | Purpose / key fields |
|---|---|
| `instances` | 1:1 with organization. `status` (queued→provisioning→ready\|error\|suspended), `flyAppName` (unique), `region`, `machineId`, `volumeId`, `publicUrl`, `gbrainVersion`, `agentTokenEncrypted`, `bootstrapTokenEncrypted`, `aiKeyMode` (bundled\|byo), `byoKeysEncrypted`, `lastHealthyAt`, `lastError` |
| `departments` | org-scoped, unique `(organizationId, slug)`; `sourceId` (gbrain source id), `status`, `lastSyncedAt`, `pageCount` |
| `member_credentials` | 1:1 with Better Auth `member`. `gbrainClientId`, `secretEncrypted` (needed for Ask UI to query *as the member*), `writeDepartmentId`, `readDepartmentIds` (jsonb), `status` (provisioning\|active\|revoked\|error) |
| `connectors` | org+department-scoped. `type` (git\|upload\|webhook\|notion\|slack\|gdrive), `configEncrypted`, `schedule` (cron), `cursor` (jsonb), `status` |
| `connector_runs` | per-run history: `status`, `stats`, `error`, timestamps |
| `usage_records` | unique `(organizationId, day, metric)`; `amount` numeric |
| `subscriptions` | 1:1 org. Stripe ids, `plan` (free\|team\|scale), `seats`, `status`, `currentPeriodEnd` |
| `audit_log` | org-scoped actor/action/target/meta |

### 5.3 Provisioning saga (worker, `provision-instance`) **[Phase 1, in progress]**

Idempotent state machine on `instances.status`; every step records progress so retries resume:

1. Generate `AGENT_TOKEN` + `GBRAIN_ADMIN_BOOTSTRAP_TOKEN`; encrypt into the instance row.
2. Fly: create app (`cpd-<orgslug>-<entropy>`) → create 10 GB volume → create machine (tenant image; env: tokens, `PUBLIC_URL=https://<app>.fly.dev`, AI keys per `aiKeyMode`; service 8080→443 with TLS + `/health` check; `restart: always`) → allocate shared IPv4 + IPv6.
3. Poll `https://<app>.fly.dev/health` until 200 (timeout 5 min).
4. Verify agent reachability (`/v1/health`); upsert the `shared` department row from `GET /v1/departments`.
5. `status=ready`, set `publicUrl`, `gbrainVersion`; audit-log.
   On failure: `status=error` + `lastError`; retry re-enters at the first incomplete step; compensation deletes the Fly app if the machine never became healthy.

Fly client **[implemented: `packages/shared/src/fly.ts`]**: Machines REST (`api.machines.dev/v1`) for apps/volumes/machines; GraphQL for IP allocation.

### 5.4 Departments & members (Phase 2)

- Department create (dashboard) → row `status=creating` → agent `POST /v1/departments` → `status=ready`. Delete requires typed confirmation → agent delete → row removed; member read-sets referencing it are re-provisioned.
- Member permission model: **exactly one write department + N read departments** (always including `shared` by default). Invite (Better Auth) → on acceptance the worker provisions the gbrain client via agent `POST /v1/members` (name = member id slug) → secret encrypted into `member_credentials`.
- **Permission change = revoke + re-register** (gbrain clients are immutable in scope): new secret issued; member's agent-access page shows the new setup block; old credentials 401 immediately.
- Isolation acceptance test (release gate): two clients with disjoint read sets; assert zero cross-department results across `search`/`query`/`think` (mirrors gbrain's company-brain tutorial Part 5 check).

### 5.5 Ask UI (Phase 3)

Server route: decrypt the signed-in member's client secret → OAuth `client_credentials` token from the tenant (`POST <publicUrl>/token`) → MCP `think`/`query` call → stream answer + citations + gap notes. The web UI is a thin client on the member's own credentials — scoping is identical to their agent's, enforced by gbrain, not by us.

### 5.6 Connectors (Phase 4) **[contract]**

```ts
interface Connector<Cfg, Cursor> {
  type: string;
  validate(cfg: Cfg): Promise<void>;                 // creds/reachability check at setup
  fetch(cfg: Cfg, cursor: Cursor | null): Promise<{
    records: SourceRecord[];                          // full or incremental batch
    nextCursor: Cursor;                               // persisted on success
  }>;
}
interface SourceRecord {
  stableId: string;      // dedupe/update key across runs
  slug: string;          // repo-relative markdown path (from stableId, deterministic)
  markdown: string | null; // null = delete (pruned upstream)
  metadata?: Record<string, unknown>; // → frontmatter
  capturedAt?: string;
}
```

Worker run: load connector → decrypt config → `fetch` from cursor → map records to files → agent `POST /v1/files` (commit + scoped sync) → persist cursor + `connector_runs` row. Idempotent by construction (same records → same paths/content → "nothing to commit"). Failures never block the brain; they surface in run history. Scheduling via pg-boss cron per connector. MVP order: git-import → upload → generic webhook (proxies tenant `POST /ingest`) → Notion → Slack → Google Drive. (Contract modeled on Vitrus's connector framework: content + stable id + incremental prune + per-sync capture.)

### 5.7 Billing & metering (Phase 5)

Stripe Checkout + customer portal; webhook-driven `subscriptions` sync; entitlements (max departments/seats/connectors per plan) enforced in the API layer. Metering: daily worker job pulls per-client spend from each tenant (`/admin/api/agents/spend` or gbrain spend logs via agent) → `usage_records` → usage page; fair-use caps via gbrain spend-posture config; hard enforcement post-MVP.

## 6. Security model

- **Tenant isolation:** separate VM, separate Postgres, separate keys per tenant. No shared data plane.
- **Department isolation:** gbrain SQL-layer source scoping (upstream fuzz-tested); our own regression test per image release.
- **Secrets:** all tenant/member/connector secrets AES-256-GCM under `CREDENTIALS_MASTER_KEY`; member client secrets returned exactly once by the agent and never displayed again; revocation deletes ciphertext.
- **Agent API:** private network only + bearer token + timing-safe compare + strict slug/path validation (no traversal out of `/data/brain-repos`).
- **Web:** Better Auth sessions; org-scoped authorization on every API route; audit log for admin actions.
- **Postgres (tenant):** localhost-only listener inside the container.

## 7. Operational requirements

- **Health:** worker polls agent `/v1/health` every 5 min → `instances.lastHealthyAt`; dashboard health card; alerting post-MVP.
- **Provisioning SLO:** p95 < 5 min signup→ready.
- **Image releases:** build with pinned `GBRAIN_REF` → CI (typecheck, unit, local compose boot, isolation suite) → staging tenant soak → fleet machine update.
- **Local dev:** `docker-compose.dev.yml` (control-plane Postgres) + `packages/tenant-image/docker-compose.yml` (full tenant on localhost:8080/8081) — the entire system runs locally without Fly.

## 8. Open questions (tracked, not blocking)

1. Custom domains per tenant (`brain.acme.com`) — post-MVP; Fly certs API makes this straightforward.
2. Fly Machines secrets handling — MVP passes tokens via machine env config (visible only to our own API token); move to Fly secrets/KMS as hardening.
3. Very large tenants (>50k pages): bigger machine sizes + `pace` mode tuning; revisit dedicated Postgres.
4. gbrain admin dashboard (`/admin` on the tenant) — expose to org admins, or keep Compandium-internal? Default: internal-only until there's demand.
5. Dream-cycle/enrichment cron defaults per tenant (gbrain autopilot) — enable conservatively once AI-spend metering is live.
