# Compandium Coding Guide

Instructions for any model or engineer working in this repo (Claude, Opus, GPT, human).
Read this before writing code. It encodes decisions already made and verified — do not
re-litigate them silently; propose changes explicitly if you disagree.

**Orientation order:** this file → [implementation-plan.md](../implementation-plan.md)
(current status, phase ledger) → [specifications.md](../specifications.md) (architecture,
verified gbrain constraints) → [PRD.md](../PRD.md) (product scope, non-goals).
`references/` holds read-only vendored checkouts (gbrain, Vitrus) for research — never
edit, import from, or ship anything in it.

## What this is

A SaaS control plane that provisions and manages hosted [gbrain](https://github.com/garrytan/gbrain)
company brains: one isolated tenant instance per customer org, departments mapped to gbrain
*sources*, member access mapped to scoped gbrain *OAuth clients*, connectors feeding markdown
into department git repos. gbrain itself is upstream open source — we deploy it, we do not
modify it.

```
apps/web          Next.js 16 control plane (Better Auth + Drizzle). Runs on Node.
apps/worker       Bun service: pg-boss jobs (provisioning, connector syncs, health, metering).
packages/db       Drizzle schema + generated migrations for the control-plane Postgres.
packages/shared   Cross-app contracts: crypto envelope, slugs, queue names, Fly/Agent/MCP clients.
packages/connectors  Pull/push connector contract + implementations. Runtime-agnostic.
packages/tenant-image  Docker image per tenant: Postgres+pgvector, gbrain, compandium-agent. Runs on Bun.
```

## Invariants (violating any of these is a bug, full stop)

1. **Tenant isolation is hard.** One org = one instance = one database = one server process.
   Never introduce a shared data plane, cross-tenant cache, or "query all tenants" path in
   product code.
2. **Every control-plane query is org-scoped.** Any Drizzle query on org-owned tables
   (`instances`, `departments`, `member_credentials`, `connectors`, …) must filter by
   `organizationId` taken from `getOrgContext()` (apps/web/lib/org.ts) — never from request
   input. API routes start with the `getOrgContext()` null-check; admin mutations also check
   `isAdmin(ctx)`.
3. **The department is the ACL boundary.** Access = gbrain OAuth client with exactly one
   `--source` (write) + a `--federated-read` set. Scope is immutable per client: changing a
   member's access is always **revoke + re-register** (see
   `apps/web/app/api/members/[memberId]/access/route.ts`). Never build UI-layer filtering as
   a substitute — isolation is enforced by gbrain at the SQL layer, and the release gate is
   an actual cross-department leak test.
4. **Secrets go through the envelope.** Anything sensitive at rest (agent tokens, bootstrap
   tokens, member client secrets, connector credentials) is AES-256-GCM encrypted with
   `encryptSecret()` / `decryptSecret()` from `packages/shared` (`CREDENTIALS_MASTER_KEY`).
   Secrets never appear in logs, audit-log `meta`, error messages, or git. A member's client
   secret is returned by the agent exactly once.
5. **The agent is the only path to CLI-only gbrain operations** (sources add/remove, sync,
   register-client, export). The control plane talks to it via `AgentClient`
   (packages/shared) over the private network with a bearer token. Never exec CLI commands
   from the control plane, and never expose agent port 8081 publicly.
6. **Markdown-in-git is the system of record.** Connectors and uploads deliver content as
   files into department repos via agent `POST /v1/files` (commit + scoped sync). Never
   write pages into the tenant database directly — that breaks export/portability, the
   product's no-lock-in promise.
7. **gbrain is pinned upstream.** The tenant image builds gbrain at the `GBRAIN_REF` build
   arg. Upgrades ship as a new image rolled across tenants — never `gbrain upgrade` in
   place, never patch gbrain source. If gbrain's behavior blocks us, the fix goes upstream.
   When bumping `GBRAIN_REF`, re-verify the "load-bearing gbrain facts" in
   specifications.md §2 (CLI flags, HTTP surface, scoping) — they are version-dependent.
8. **All user-supplied path/slug material is validated before touching a filesystem or
   shell.** Slugs match `^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$` (`isSafeSlug` in the agent,
   `isValidSlug` in shared); file paths are resolved and checked against the repo root
   (see `putFiles` in `packages/tenant-image/agent/server.ts`). Connector `stableId`s go
   through `pathFromStableId`. Tokens are compared with `timingSafeEqual`.

## Conventions

### Runtime boundaries
- `packages/connectors` and `packages/shared` are **runtime-agnostic**: `node:*` APIs only
  (e.g. `node:child_process`, `node:crypto`), no `Bun.*` — apps/web runs them on Node.
- `Bun.*` APIs are fine in `apps/worker` and `packages/tenant-image` (Bun-only processes).
- Client components must not import `@compandium/shared` (its index pulls `node:crypto`);
  import pure subpaths instead: `@compandium/shared/slug`. Add new pure subpaths to the
  package `exports` map when client code needs shared logic.

### Contracts live in one place
- Queue names + payload types: `packages/shared/src/queues.ts`. Producers (web) and
  consumers (worker) both import `QUEUES` — string-literal queue names anywhere else are a
  review reject.
- The agent HTTP API shape is mirrored by `AgentClient`; change both sides in the same
  commit, and remember the deployed image lags the repo until rebuilt.
- Connector implementations conform to `PullConnector`/`PushConnector`
  (`packages/connectors/src/types.ts`): zod `configSchema`, cheap `validate()` at setup,
  cursor-incremental `fetch()`. External HTTP goes through `getJson`/`httpFetch`
  (`src/http.ts`) so tests can stub the transport — never call global `fetch` directly in a
  connector.

### Data & jobs
- Schema changes: edit `packages/db/src/schema/*.ts`, then `bun run db:generate` +
  `bun run db:migrate`. Never hand-edit files in `migrations/`. Auth tables mirror Better
  Auth's generator — reconcile there after a better-auth upgrade rather than improvising.
- pg-boss: **v10 everywhere** — mixing majors migrates the shared `pgboss` schema and
  silently strands jobs (this happened; it cost a debugging session). The worker owns
  `createQueue`/`schedule`/maintenance; web sends only (`supervise: false, schedule: false`).
- Everything retried must be idempotent: provisioning saga steps re-enter safely (tokens
  reused from ciphertext, Fly volume/machine reuse, docker container reuse), connector runs
  key on `stableId` so re-imports produce "nothing to commit" (which is success, not an
  error), `onConflictDoNothing` for mirror rows.
- Long agent operations get explicit timeouts (sync 10 min); every external call has an
  `AbortSignal.timeout`.

### Code style
- Strict TS everywhere (`noUncheckedIndexedAccess` is on — index access yields `T |
  undefined`; handle it, don't `!` it away unless the invariant is local and obvious).
  No `any`; use `unknown` + narrowing at boundaries.
- Parse, don't trust: request bodies via zod or explicit field checks with 400s; connector
  configs via their schema; never spread raw request input into a DB write.
- API routes return `{ error: string }` JSON with a correct status (401/403/400/404/409/502)
  — 409 for "brain not ready", 502 for downstream (agent/tenant) failures with a truncated
  `detail`.
- Comments state constraints the code can't ("must stay last", "dedicated per-tenant DB, so
  safe", "re-fetch the whole day so files never hold partial views") — not narration of what
  the next line does.
- UI: Tailwind utility classes, zinc palette, dark-mode variants on every surface, small
  client components with explicit `busy`/`error` state; server components fetch, client
  components mutate + `router.refresh()`.

## Verification discipline (the actual bar)

"Done" means demonstrated, not compiled:

1. `bun run typecheck` and `bun run test` green at the repo root — every commit.
2. Touched `packages/tenant-image`? Rebuild the tag the provisioner uses —
   `docker build -t compandium-tenant .` in that directory (building via `docker compose`
   produces a *differently named* image; this mismatch has bitten before) — and re-run the
   local gate: `/health` 200, agent `/v1/health` ok, department create, `putFiles` +
   scoped search over MCP.
3. Touched provisioning, member access, or anything near scoping? Re-run the **isolation
   check**: two members with disjoint department read-sets; the same query must return
   results for one and `[]` for the other. Zero tolerance.
4. Touched web UI? Load it in a real browser session (dev server: `bun run dev`, port 3100)
   and exercise the flow — snapshots of rendered pages, not assumptions. Note: React
   controlled forms need real input events; browser-automation "fill" helpers that set
   `.value` directly won't update React state.
5. Unverifiable-by-us integrations (no credentials available) are allowed only as:
   documented-API implementation + fixture unit tests through the injectable transport +
   explicitly marked **unverified** in implementation-plan.md. Never mark them verified.
6. Update implementation-plan.md's status section in the same commit as the work — it is
   the session-to-session source of truth and must not lie.

## Dev environment (Windows host)

- Bring-up: `docker compose -f docker-compose.dev.yml up -d` (control-plane Postgres on
  host port **5544** — 5432/5433 belong to other projects on this machine), worker via
  `bun --env-file=.env run apps/worker/src/index.ts`, web via `bun run dev` (**:3100**;
  3000 is taken — `BETTER_AUTH_URL` must match).
- PowerShell 5.1 writes a BOM with `Out-File`/`Set-Content -Encoding utf8`, which corrupts
  `.env` and `package.json`. Write files with the Write tool, or
  `[IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $false))`.
  Multi-line git commit messages: `git commit -F <ascii file>` (inline quotes get mangled).
- Deleting a Next.js route can leave stale generated types under `.next/dev/types` that
  fail typecheck — remove `apps/web/.next` and re-run.
- `scripts/dev-seed.ts` seeds a department through the agent for demos (uses relative
  imports because `scripts/` is not a workspace).

## Change checklist

Before committing, confirm:

- [ ] Org-scoping + role checks on any new/changed API route
- [ ] New secrets go through `encryptSecret`; nothing sensitive in logs/audit meta
- [ ] No `Bun.*` in `packages/{shared,connectors}`; no `@compandium/shared` index import in client components
- [ ] Queue names via `QUEUES`; new jobs registered in worker `index.ts` and idempotent
- [ ] Slugs/paths validated on anything that reaches a filesystem, shell, or URL
- [ ] `bun run typecheck` + `bun run test` green; live verification done per the table above
- [ ] implementation-plan.md status updated if phase-relevant
- [ ] No edits under `references/`; no dead code left behind (routes, exports, cursor fields)
