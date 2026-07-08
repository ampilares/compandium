import Link from "next/link";
import { LeadCapture } from "@/components/lead-capture";

// Marketing page is deliberately dark-committed (brand surface); the app
// dashboard keeps the neutral light/dark theme.

const DEMO_LINES: Array<{ text: string; className?: string }> = [
  { text: "$ ask \"how was the payment outage resolved?\"", className: "text-zinc-400" },
  { text: "" },
  { text: "The payment gateway rate limit was raised from 500 to" },
  { text: "1000 rps after the June 2026 outage [1]. Decision owner:" },
  { text: "Dana (platform team) [2]. Revisit when sustained traffic" },
  { text: "passes 800 rps [2]." },
  { text: "" },
  { text: "Sources:", className: "text-zinc-500" },
  { text: "  [1] engineering/runbooks/payment-rate-limit", className: "text-indigo-300" },
  { text: "  [2] engineering/decisions/d-007-rate-limit", className: "text-indigo-300" },
  { text: "" },
  { text: "⚠ What your brain doesn't know:", className: "text-amber-300" },
  { text: "  · No follow-up filed since the decision on 2026-06-14.", className: "text-amber-200/80" },
];

const AGENTS = ["Claude Code", "Claude Desktop", "Cursor", "Codex", "OpenClaw", "Any MCP client"];

const FEATURES = [
  {
    title: "Answers, not search results",
    body: "gbrain's synthesis layer writes the answer with citations to source pages — and an honest note on what isn't documented yet. No more ten blue chunks.",
    icon: (
      <path d="M8 10h8M8 14h5M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2v-1a2 2 0 0 1 2-2h1c1 0 2-.5 2-2a9 9 0 0 0-7-11z" />
    ),
    wide: true,
  },
  {
    title: "Departments with real isolation",
    body: "Engineering, Sales, Legal — each an isolated slice, enforced in the database layer. A member without Legal access gets zero Legal results, ever.",
    icon: <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4zM9 12l2 2 4-4" />,
    wide: false,
  },
  {
    title: "Your agents, your scope",
    body: "Each member gets credentials that work in any MCP client. Your AI agent sees exactly what you see — nothing more.",
    icon: <path d="M12 8V4m0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 20c1.5-2.5 4.5-4 8-4s6.5 1.5 8 4M9 4h6" />,
    wide: false,
  },
  {
    title: "Fed automatically",
    body: "Git repos, Notion, Slack, Google Drive, uploads, webhooks — everything becomes markdown in your department repos and syncs on a schedule.",
    icon: <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
    wide: false,
  },
  {
    title: "A dedicated instance",
    body: "Your own isolated server and database. Your knowledge never shares a data plane with anyone else's.",
    icon: <path d="M4 6h16v5H4zM4 13h16v5H4zM7 8.5h.01M7 15.5h.01" />,
    wide: false,
  },
  {
    title: "No lock-in, by design",
    body: "Everything is markdown in git. Export any department as a git bundle and run open-source gbrain yourself — same brain, self-hosted.",
    icon: <path d="M12 3v10m0 0l-3.5-3.5M12 13l3.5-3.5M5 21h14M5 17.5V21m14-3.5V21" />,
    wide: true,
  },
];

const STEPS = [
  ["Provision", "Sign up, name your workspace, click once. A dedicated brain boots in minutes with a shared department ready."],
  ["Connect & divide", "Create departments that mirror your confidentiality boundaries. Point connectors at the tools you already use."],
  ["Ask everywhere", "Your team asks from the dashboard; your agents connect over MCP with each member's own scoped credentials."],
] as const;

const CONNECTORS = [
  ["Git repos", "wikis, Obsidian, docs folders"],
  ["Notion", "every page you share"],
  ["Slack", "channels as daily digests"],
  ["Google Drive", "Docs exported as markdown"],
  ["Uploads", "drop .md files in"],
  ["Webhooks", "Zapier, IFTTT, Shortcuts"],
] as const;

const FAQ = [
  [
    "How is this different from a search tool or RAG chatbot?",
    "Search hands you pages; Compandium's engine (gbrain) writes the answer with citations and tells you what's missing. It also maintains a typed knowledge graph, so \"who decided X\" and \"what changed since March\" work — not just keyword lookup.",
  ],
  [
    "Can people see things they shouldn't?",
    "No. Access is enforced at the database layer of your dedicated instance, not in our UI. Every member's credentials carry an explicit read/write department scope, and our release gate includes a cross-department leak test.",
  ],
  [
    "What do AI agents get?",
    "The same brain, the same scope. Each member's credentials work in Claude Code, Claude Desktop, Cursor, Codex, or any MCP client — the agent inherits exactly that member's department access.",
  ],
  [
    "What if we want to leave?",
    "Your knowledge is markdown in git repos. Export every department as a git bundle from the dashboard and run the open-source engine yourself. Leaving is a supported feature, not a support ticket.",
  ],
  [
    "What does it cost?",
    "Free while in early access. Planned tiers: Free (1 department, 3 seats), Team (per-seat, unlimited departments, all connectors), Scale (dedicated resources, BYO AI keys). Early-access workspaces keep preferential pricing.",
  ],
] as const;

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-indigo-400">{eyebrow}</p>
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-4 text-zinc-400">{sub}</p>}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      {/* sticky nav */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/70 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-sm">◆</span>
            Compandium
          </Link>
          <div className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
            <a href="#product" className="hover:text-white">Product</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#connectors" className="hover:text-white">Connectors</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:text-white">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-violet-400"
            >
              Create your brain
            </Link>
          </div>
        </nav>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        {/* glow + grid backdrop */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-[-20%] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-600/25 blur-[140px]" />
          <div className="absolute left-[15%] top-[30%] h-[300px] w-[300px] rounded-full bg-violet-600/20 blur-[100px]" />
          <div
            className="absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgb(255 255 255 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.06) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent)",
            }}
          />
        </div>

        <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-8 px-6 pb-16 pt-24 text-center">
          <a
            href="https://github.com/garrytan/gbrain"
            className="group flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-zinc-300 backdrop-blur transition hover:border-indigo-400/50"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Powered by open-source gbrain
            <span className="text-zinc-500 transition group-hover:translate-x-0.5">→</span>
          </a>

          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Every answer your company
            <br />
            <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-indigo-300 bg-clip-text text-transparent">
              already knows — on demand
            </span>
          </h1>

          <p className="max-w-xl text-lg leading-relaxed text-zinc-400">
            A private company brain for your team and your AI agents. Divided into departments with
            real access control, fed by the tools you already use, answering with citations — provisioned
            in minutes.
          </p>

          <LeadCapture source="hero" />
          <p className="text-sm text-zinc-500">
            Free during early access · dedicated instance · your data stays in git — export anytime
          </p>
        </div>

        {/* terminal demo */}
        <div className="relative mx-auto max-w-3xl px-6 pb-24">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/70 shadow-2xl shadow-indigo-950/50 backdrop-blur">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-5 py-3.5">
              <span className="h-3 w-3 rounded-full bg-red-400/70" />
              <span className="h-3 w-3 rounded-full bg-amber-400/70" />
              <span className="h-3 w-3 rounded-full bg-emerald-400/70" />
              <span className="ml-3 text-xs text-zinc-500">acme-rockets — company brain</span>
            </div>
            <pre className="overflow-x-auto p-6 text-[13px] leading-relaxed">
              {DEMO_LINES.map((line, i) => (
                <div key={i} className={line.className ?? "text-zinc-200"}>
                  {line.text || " "}
                </div>
              ))}
            </pre>
          </div>
          <p className="mt-4 text-center text-sm text-zinc-500">
            Every answer carries its sources — and admits what isn&apos;t documented yet.
          </p>
        </div>
      </section>

      {/* agent strip */}
      <section className="border-y border-white/10 bg-white/[0.02] py-10">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="mb-5 text-sm text-zinc-500">One brain, read by humans and every agent your team runs</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {AGENTS.map((a) => (
              <span key={a} className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-zinc-300">
                {a}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* features bento */}
      <section id="product" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <SectionHeading
          eyebrow="Why Compandium"
          title="Institutional memory that actually gets used"
          sub="Everything the open-source engine can do, minus the ~90 minutes of expert setup and the ongoing ops."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-indigo-400/40 hover:bg-white/[0.05] ${f.wide ? "lg:col-span-2" : ""}`}
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  {f.icon}
                </svg>
              </div>
              <h3 className="mb-2 font-medium">{f.title}</h3>
              <p className="text-sm leading-relaxed text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>

        {/* engine stats */}
        <div className="mt-12 grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-indigo-950/40 to-violet-950/40 p-8 text-center sm:grid-cols-3">
          {[
            ["97.6%", "recall@5 on the public LongMemEval benchmark (gbrain engine)"],
            ["+31 pts", "precision over vector-only RAG via the knowledge graph"],
            ["~122 ms", "median retrieval latency (engine benchmark)"],
          ].map(([n, label]) => (
            <div key={label}>
              <p className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-4xl font-semibold text-transparent">{n}</p>
              <p className="mx-auto mt-2 max-w-[26ch] text-sm text-zinc-400">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-zinc-600">
          Engine benchmarks published upstream by the gbrain project.
        </p>
      </section>

      {/* how it works */}
      <section id="how" className="border-t border-white/10 bg-white/[0.02] scroll-mt-20">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <SectionHeading eyebrow="How it works" title="From signup to sourced answers in minutes" />
          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="relative rounded-2xl border border-white/10 bg-zinc-900/50 p-6">
                <span className="mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-semibold">
                  {i + 1}
                </span>
                <h3 className="mb-2 font-medium">{title}</h3>
                <p className="text-sm leading-relaxed text-zinc-400">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* connectors */}
      <section id="connectors" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <SectionHeading
          eyebrow="Connectors"
          title="Your knowledge is already somewhere. Point us at it."
          sub="Each connector feeds one department, so imported content inherits that department's access rules automatically."
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {CONNECTORS.map(([name, blurb]) => (
            <div key={name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
              <p className="font-medium">{name}</p>
              <p className="mt-1 text-xs text-zinc-500">{blurb}</p>
            </div>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="border-t border-white/10 bg-white/[0.02] scroll-mt-20">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <SectionHeading
            eyebrow="Pricing"
            title="Free while in early access"
            sub="Early-access workspaces get the full product and keep preferential pricing when plans launch."
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {[
              { name: "Free", price: "$0", note: "for trying it out", items: ["1 department + shared", "3 seats", "2 connectors", "Bring your own AI keys"] },
              { name: "Team", price: "Early access", note: "full product, free for now", items: ["Dedicated instance", "Unlimited departments", "All connectors", "Bundled AI included", "Agent access for every seat"], highlight: true },
              { name: "Scale", price: "Let's talk", note: "for larger teams", items: ["Bigger dedicated resources", "BYO AI keys", "Priority support", "Custom regions"] },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`rounded-2xl border p-8 ${tier.highlight ? "border-indigo-400/50 bg-gradient-to-b from-indigo-950/50 to-zinc-900/50 shadow-xl shadow-indigo-950/40" : "border-white/10 bg-zinc-900/40"}`}
              >
                <div className="mb-6">
                  <p className="text-sm font-semibold uppercase tracking-widest text-zinc-400">{tier.name}</p>
                  <p className="mt-2 text-3xl font-semibold">{tier.price}</p>
                  <p className="mt-1 text-sm text-zinc-500">{tier.note}</p>
                </div>
                <ul className="mb-8 flex flex-col gap-2.5 text-sm text-zinc-300">
                  {tier.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`block rounded-xl py-2.5 text-center text-sm font-semibold transition ${tier.highlight ? "bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400" : "border border-white/15 hover:bg-white/5"}`}
                >
                  {tier.name === "Scale" ? "Contact us" : "Get started free"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-6 py-24">
        <SectionHeading eyebrow="FAQ" title="Questions teams actually ask" />
        <div className="flex flex-col gap-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-4 open:bg-white/[0.05]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <span className="text-zinc-500 transition group-open:rotate-45">＋</span>
              </summary>
              <p className="pt-3 text-sm leading-relaxed text-zinc-400">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section className="relative overflow-hidden border-t border-white/10">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute bottom-[-40%] left-1/2 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-indigo-600/25 blur-[120px]" />
        </div>
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Stop answering the same question twice
          </h2>
          <p className="text-zinc-400">
            Provision your company brain now — first sourced answer in under an hour.
          </p>
          <LeadCapture source="footer-cta" />
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-10 text-center text-sm text-zinc-500">
        <p className="mx-auto max-w-2xl">
          Compandium hosts and operates{" "}
          <a className="underline hover:text-zinc-300" href="https://github.com/garrytan/gbrain">
            gbrain
          </a>{" "}
          (MIT, by Garry Tan). The engine is open source; we sell the operations. Export your
          departments anytime and run it yourself.
        </p>
      </footer>
    </div>
  );
}
