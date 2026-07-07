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

## Phase 1 — Tenant image + provisioning ✅ (local; Fly pending credentials)

The per-tenant runtime and the pipeline that creates it.

- ✅ `packages/tenant-image/Dockerfile` — postgres:17 + pgvector + Bun + gbrain (pinned `GBRAIN_REF` build arg)
- ✅ `supervisor.ts` — initdb/start Postgres (gbrain role needs SUPERUSER: event triggers + RLS in migrations), first-boot bootstrap (non-interactive init, federated `shared` department, `--no-embed` sync when keyless), child supervision with backoff
- ✅ `agent/` — private management API (departments, sync, files, members, health, export); register-client scopes are space-separated; keyless syncs pass `--no-embed`
- ✅ `packages/shared`: Fly client, typed agent client, MCP-over-HTTP client
- ✅ **Local boot gate PASSED**: health, department create, file batch → commit → sync, member registration, OAuth token, MCP search returning seeded content, and the cross-department isolation check (zero leaks)
- ✅ Provisioning saga (`provision-instance`): idempotent token reuse → provider.provision → health poll → `shared` mirror → ready; `TenantProvisioner` abstraction with **DockerProvisioner** (local dev, verified e2e from the dashboard) and **FlyProvisioner** (written, unverified — needs `FLY_API_TOKEN`/`FLY_ORG_SLUG`/pullable `TENANT_IMAGE`)
- ✅ Web onboarding: BrainCard provision button → live status polling → ready card with MCP endpoint
- ⬜ Image publish workflow (GHCR or Fly registry) — blocks Fly-live verification
- ⬜ Fly-live gate (needs credentials from the user)

## Phase 2 — Departments, members, scoped access ✅ (email invites pending SMTP)

- Department CRUD (dashboard → API → agent), status + page counts on the overview
- Member invites (Better Auth invitation flow) → automatic gbrain client provisioning; permission matrix editor (1 write dept + N read depts); change = revoke + re-register; instant revoke on removal
- Agent-access page per member: copy-paste MCP setup for Claude Code / Claude Desktop / Cursor / Codex against `<publicUrl>/mcp`
- Audit log entries for all admin actions

**Verification gate:** two members with disjoint department access; run the isolation check (scoped search from each; zero cross-department results). Removing a member 401s their agent immediately.

## Phase 3 — Ask UI + health ✅ (synthesis text needs an AI key in the tenant)

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

## Current status (2026-07-07, end of day)

**The e2e MVP critical path works locally**: signup → workspace → one-click provision (Docker provider) → tenant container boots gbrain + agent → departments created from the UI → member access provisioned (scoped gbrain OAuth clients; isolation verified — zero cross-department leaks) → agent-access page with MCP snippets → Ask page answering via the member's own credentials (search fully working; think degrades gracefully keyless). Health polling records tenant liveness every 5 minutes.

**Blocked on user input:** Fly-live verification (`FLY_API_TOKEN`, `FLY_ORG_SLUG`, image registry choice), bundled AI keys (`BUNDLED_ANTHROPIC_API_KEY` / `BUNDLED_OPENAI_API_KEY`) for real synthesis + embeddings, SMTP for email invites (copyable invite links work today).

**Next up:** Phase 4 connectors (git import → upload → webhook → Notion → Slack → Drive), then Phase 5 billing.
