# Compandium — Product Requirements Document

**Working name:** Compandium
**One-liner:** Hosted, managed company brains powered by gbrain — set up in minutes, divided into departments, connected to your tools, queryable by your team and your AI agents.
**Status:** MVP in development (see [implementation-plan.md](implementation-plan.md))
**Comparable product:** [Vitrus Cloud](https://vitrus.dev) (same category; Compandium hosts gbrain instead of the Vitrus engine)

---

## 1. Problem

Companies accumulate critical knowledge across Slack, Notion, Google Drive, meeting notes, and people's heads. Retrieval tools return raw pages; nobody maintains the wiki; new hires and AI agents alike operate without institutional memory.

[gbrain](https://github.com/garrytan/gbrain) (MIT, by Garry Tan) solves the engine problem: a markdown-canonical brain with hybrid search, a self-wiring knowledge graph, a synthesis layer that returns *answers with citations and gap analysis*, and multi-user OAuth scoping. YC has flagged "company brain" in its Request for Startups.

But gbrain as a company brain is a **~90-minute expert install**: a Postgres server, git repos per team area, CLI-registered OAuth clients per person, a public HTTPS endpoint, cron maintenance, and per-teammate MCP configuration. That's the gap Compandium fills: **gbrain's capability without gbrain's ops.**

## 2. Product vision

A company signs up, names their workspace, and gets a private, isolated company brain provisioned automatically. They carve it into **departments** (Engineering, Sales, Legal, …) that mirror their org's confidentiality boundaries. They invite members and set, per member, which departments they can write to and read from. They connect data sources (Notion, Slack, Drive, git repos, uploads, webhooks) that keep departments fed automatically. Everyone queries the brain — from a web dashboard or from any MCP-capable AI agent (Claude Code, Claude Desktop, Cursor, OpenClaw…) — and gets synthesized answers with citations, scoped to exactly what they're allowed to see.

**Positioning: operations, not capability.** Like Vitrus Cloud vs the Vitrus engine, everything the brain *does* is open-source gbrain. Compandium sells provisioning, isolation, access management, connectors, uptime, backups, and zero-friction onboarding. No lock-in: knowledge is markdown in git; customers can export their departments as git bundles and run gbrain themselves.

## 3. Target customers & personas

- **Primary: 10–100 person companies** that already use AI agents/assistants and want shared institutional memory with access control. Champion is a founder, COO, or head of ops/eng.
- **Personas:**
  - **Org admin** (buyer/operator): creates the workspace, defines departments, invites members, connects sources, watches health and usage, manages billing.
  - **Member** (daily user): asks questions in the dashboard or through their AI agent; captures notes; only sees their departments.
  - **AI agent** (machine user): connects over MCP with the member's credentials; same scoping as the member it belongs to.

## 4. Core concepts

| Compandium concept | Backed by (gbrain) | Notes |
|---|---|---|
| Workspace (organization) | One dedicated gbrain instance (own server + own Postgres) | Hard tenant isolation; one Fly.io app per tenant |
| Department | A gbrain **source** (its own git repo) | The unit of access control and connector binding; `shared` created by default |
| Member access | A gbrain **OAuth client** per member | `--source` = the one department they write to; `--federated-read` = departments they can read |
| Connector | Worker job writing markdown into a department repo + scoped sync | Markdown-in-git stays the portable system of record |
| Ask | gbrain `think`/`query` over MCP with the member's own credentials | Web answers scoped identically to agent answers |

## 5. MVP feature set (committed scope)

### 5.1 Core hosting
- Self-serve signup (email/password + Google), workspace creation.
- **One-click brain provisioning**: dedicated instance (Fly.io Machine + volume) running Postgres+pgvector, `gbrain serve --http` (MCP + OAuth 2.1), and a private management agent. Target: **ready in under 5 minutes**, `shared` department pre-created.
- **Departments**: create/rename/delete; each is an isolated gbrain source; per-department sync status and page counts.
- **Members**: invite by email; per-member permission matrix (one write department, N read departments); credential provisioning is automatic; revocation is instant.
- **Agent access page**: per-member copy-paste setup blocks for Claude Code, Claude Desktop, Cursor, Codex pointing at the tenant MCP endpoint (`https://<workspace>-brain.fly.dev/mcp`).
- **Ask UI**: web page that runs the member's question through gbrain's synthesis (`think`) with the member's own credentials; renders answer + citations + "what the brain doesn't know" gap notes.
- **Health**: instance status card, per-department last-sync, manual re-sync.

### 5.2 Managed connectors
- Gallery of sources; each connector instance binds to **one department** (the department is the ACL boundary).
- MVP set, in order: **git repo import** (any repo URL — covers wikis/Obsidian), **markdown/zip upload**, **generic webhook** (Zapier/IFTTT/Shortcuts), **Notion**, **Slack**, **Google Drive**.
- Scheduled incremental syncs with stored cursors; run history with errors surfaced; credentials encrypted at rest.

### 5.3 Billing (Stripe)
- **Free**: 1 department, 3 seats, 2 connectors, BYO AI keys (or tightly capped bundled).
- **Team** ($/seat/mo): dedicated instance, unlimited departments, all connectors, bundled AI with fair-use cap.
- **Scale** (custom): bigger machine, BYO keys, priority support.
- Checkout + customer portal; seats synced from active members; daily AI-usage metering per tenant surfaced on a usage page.

### 5.4 AI keys
- **Bundled by default**: Compandium's provider keys injected into the tenant; usage metered per tenant (gbrain tracks per-client spend). Zero-friction onboarding.
- **BYO optional**: org pastes their own Anthropic/OpenAI keys; stored encrypted; injected as tenant secrets.

## 6. Key user journeys

1. **Founding admin, zero → answering brain (< 30 min):** sign up → name workspace → brain provisions (~3–5 min, progress shown) → create `engineering` + `sales` departments → connect Notion to `shared`, git repo to `engineering` → first sync completes → asks "how do we handle refunds?" → sourced answer with a gap note.
2. **Inviting a teammate:** admin invites bob@acme.com with write `sales`, read `sales` + `shared` → Bob accepts, sees Ask UI scoped to his departments → copies the Claude Code block from his agent-access page → his agent now shares his exact scope. Bob never sees `engineering` content — enforced at gbrain's SQL layer, not in our UI.
3. **Offboarding:** admin removes Bob → his OAuth client is revoked instantly → his agent's next request 401s. His past writes remain in `sales` (the company's knowledge, in the department repo).
4. **Leaving (no lock-in):** admin exports departments as git bundles → runs `gbrain init` + `gbrain import` locally → same brain, self-hosted.

## 7. Non-goals (MVP)

- No SSO/SAML/SCIM (post-MVP, Scale tier).
- No fine-grained per-page ACLs — the department is the smallest access unit (matches gbrain's source model).
- No self-serve on-prem/air-gapped offering (Vitrus Enterprise territory; later).
- No Slack answers bot in MVP (fast follow — high demand, cut for scope).
- No modifications to gbrain itself; we deploy upstream releases pinned per image. Anything needing engine changes goes upstream as PRs.
- No per-person crons / custom skills management UI (power feature; later).

## 8. Success metrics

- **Activation:** signup → provisioned brain → ≥1 department synced → ≥1 real query with citations, within 1 hour, without support. Target ≥ 60% of signups.
- **Time-to-brain:** provisioning p95 < 5 minutes.
- **Adoption:** ≥ 3 active queriers per paying workspace in week 2; ≥ 1 agent (MCP) connection per workspace in month 1.
- **Trust:** zero cross-department leak reports; isolation regression suite green on every tenant-image release.
- **Revenue:** first 10 paying teams within 90 days of launch.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| gbrain is a fast-moving upstream (frequent releases, occasional breaking migrations) | Pin gbrain by ref per tenant-image build; roll tenants forward by image release; staging tenant soak before fleet rollout |
| Cross-tenant/cross-department leaks would be fatal to trust | Hard isolation (instance per tenant); gbrain's SQL-layer source scoping (fuzz-tested upstream); our own isolation regression test per release |
| Bundled AI cost blowout | Per-tenant metering from gbrain spend logs; fair-use caps; gbrain spend-posture config as hard stop; BYO path |
| Fly.io single-provider dependency | Tenant image is plain Docker + one volume; portable to any host; control plane talks to a thin provider client |
| Upstream license/goodwill | gbrain is MIT; credit prominently (as Vitrus does); contribute fixes upstream |
| Connector API churn (Notion/Slack/Drive) | Connectors isolated in one package with a stable internal contract; failures surface in run history, never block the brain |

## 10. Competition & differentiation

- **Vitrus Cloud** — same category, own engine. Differentiation: gbrain's graph + synthesis benchmarks, its 43-skill agent ecosystem, and its momentum as the YC-flagged reference implementation.
- **Notion AI / Glean / Danswer etc.** — search/RAG products. Differentiation: agent-native (MCP-first, agents share human scoping), markdown-in-git ownership, honest gap analysis.
- **DIY gbrain** — free but ~90 min of expert ops + ongoing maintenance. We are the "don't want to run it" path; export keeps us honest.
