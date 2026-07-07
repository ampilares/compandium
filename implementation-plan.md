# Compandium — Implementation Plan

Companion to [PRD.md](PRD.md) and [specifications.md](specifications.md). Phases are sequential milestones; each ends with a concrete verification gate. Status legend: ✅ done · 🔨 in progress · ⬜ not started.

---

## Phase 0 — Monorepo scaffold ✅ (committed `43c854c`)

Turborepo + Bun workspaces; CI (typecheck + test on push/PR).

- ✅ `apps/web`: Next.js 16 + Better Auth (email/password, organization plugin) — landing, signup/login, dashboard shell, create-workspace flow
- ✅ `apps/worker`: pg-boss scaffold; queues `provision-instance`, `connector-sync`, `health-poll`, `meter-usage`; health/metering cron stubs
- ✅ `packages/db`: Drizzle schema v1 (auth tables + `instances`, `departments`, `member_credentials`, `connectors`, `connector_runs`, `usage_records`, `subscriptions`, `audit_log`) + initial migration
- ✅ `packages/shared`: AES-256-GCM secret envelope, slug helpers (tested)
- ✅ `docker-compose.dev.yml` (control-plane Postgres 17), `.env.example`, GitHub Actions CI

**Verification (passed):** migrations apply cleanly; `bun run typecheck` + `bun run test` green; browser walkthrough signup → session → org creation → dashboard.

## Phase 1 — Tenant image + provisioning 🔨

The per-tenant runtime and the pipeline that creates it.

- ✅ `packages/tenant-image/Dockerfile` — postgres:17 + pgvector + Bun + gbrain (pinned `GBRAIN_REF` build arg); **image builds successfully**
- ✅ `supervisor.ts` — initdb/start Postgres, first-boot brain bootstrap (non-interactive init, `shared` department), supervise `gbrain serve --http` + agent with restart/backoff
- ✅ `agent/` — private management API (departments, sync, files, members, health, export) with tests for output parsing + slug safety
- ✅ `packages/shared/src/fly.ts` — Fly Machines REST + GraphQL IP allocation client
- ✅ `packages/shared/src/agent-client.ts` — typed agent client for worker/web
- ⬜ **Local boot verification** (gate below)
- ⬜ Provisioning saga in worker (`provision-instance` handler): token generation → Fly app/volume/machine/IPs → health poll → `status=ready`; idempotent resume + compensation on failure
- ⬜ Web: "Create your brain" onboarding (region pick → provision → live progress → ready card with MCP endpoint)
- ⬜ Image publish workflow (GHCR or Fly registry) + `TENANT_IMAGE_REF` config

**Verification gate:**
1. `cd packages/tenant-image && docker compose up` → `GET :8080/health` 200; agent `GET :8081/v1/health` ok; `POST /v1/departments {slug:"engineering"}` → visible in `GET /v1/departments`; `POST /v1/members` returns credentials; OAuth `client_credentials` token from `:8080/token` works for an MCP `search` call.
2. With `FLY_API_TOKEN` set: dashboard button provisions a real tenant end-to-end in < 5 min; instance row reaches `ready` with a working public MCP endpoint.

## Phase 2 — Departments, members, scoped access ⬜

- Department CRUD (dashboard → API → agent), status + page counts on the overview
- Member invites (Better Auth invitation flow) → automatic gbrain client provisioning; permission matrix editor (1 write dept + N read depts); change = revoke + re-register; instant revoke on removal
- Agent-access page per member: copy-paste MCP setup for Claude Code / Claude Desktop / Cursor / Codex against `<publicUrl>/mcp`
- Audit log entries for all admin actions

**Verification gate:** two members with disjoint department access; run the isolation check (scoped search from each; zero cross-department results). Removing a member 401s their agent immediately.

## Phase 3 — Ask UI + health ⬜

- Ask page: member-scoped OAuth token → gbrain `think` over MCP → streamed answer with citations + gap notes; recent-questions list
- Instance health card (agent `/v1/health` via 5-min worker poll), per-department last-sync + page counts, manual re-sync button
- `health-poll` job wired to `instances.lastHealthyAt`; degraded banner in dashboard

**Verification gate:** seeded department content answers a question in the Ask UI with correct citations; a member without access to that department gets a no-answer/gap response for the same question.

## Phase 4 — Managed connectors ⬜

Order: contract + `git` import → markdown/zip `upload` → generic `webhook` (proxies tenant `/ingest`) → `notion` → `slack` → `gdrive`.

- `packages/connectors`: `Connector` contract (validate/fetch/cursor) + implementations; unit tests with recorded fixtures
- Worker `connector-sync` handler: decrypt config → fetch(cursor) → agent `POST /v1/files` → persist cursor + run row; per-connector pg-boss cron; retries with backoff; error surfacing
- Dashboard: connector gallery, config forms (credential fields encrypted), department binding, run history, manual "sync now"

**Verification gate:** Notion (or git) connector against a real workspace: content lands in the department repo, syncs, and is queryable in Ask; second run is incremental (no dupes — "nothing to commit"); revoking the source credential surfaces a failed run without affecting queries.

## Phase 5 — Billing + usage metering ⬜

- Stripe products (Free/Team/Scale), Checkout + customer portal, webhook → `subscriptions`
- Entitlement enforcement (departments/seats/connectors caps) in API routes
- `meter-usage` job: per-tenant AI spend via agent → `usage_records`; usage page; fair-use cap warnings (hard caps via gbrain spend-posture later)
- BYO-keys flow: org pastes keys → encrypted → machine env update + restart

**Verification gate:** test-mode checkout upgrades a workspace and lifts caps; canceling downgrades; usage records appear after the metering job; BYO key swap verified by a successful embed/think after restart.

## Phase 6 — Launch polish ⬜

- Marketing site (what-it-looks-like demo, connector gallery, pricing) — Vitrus-style, with prominent gbrain credit
- Export-my-brain: per-department git bundles from the dashboard (agent `/v1/export`)
- Audit log UI, docs (setup guides per MCP client), support email, status page
- Tenant-image release pipeline: build (pinned `GBRAIN_REF`) → CI + isolation suite → staging soak → fleet rollout

**Verification gate:** a cold signup (someone not on the team) reaches a cited answer without help in under an hour — the PRD activation metric.

---

## Working agreements

- **Testing:** every package keeps `bun test` green; CI on every push. The cross-department isolation suite is a release gate for the tenant image.
- **gbrain upgrades:** bump `GBRAIN_REF` deliberately; re-verify the "load-bearing facts" in specifications.md §2; never `gbrain upgrade` in place.
- **Secrets:** anything sensitive at rest goes through `encryptSecret()` (`packages/shared`); member client secrets are never displayed after first issue.
- **Scope discipline:** engine gaps → upstream gbrain PRs, not forks. Slack answers bot, SSO, per-page ACLs, on-prem stay out of MVP (PRD §7).

## Current status (2026-07-07)

Phase 0 complete and verified end-to-end in the browser. Phase 1 code is written (image builds; supervisor, agent, Fly + agent clients done, all typechecked/tested); next steps are the local compose boot gate, the worker provisioning saga, and the onboarding flow.
