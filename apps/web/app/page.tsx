import Link from "next/link";

const FEATURES = [
  {
    title: "Answers, not search results",
    body: "Powered by gbrain's synthesis layer: your team asks in plain language and gets a written answer with citations to the source pages — and an honest note on what the brain doesn't know yet.",
  },
  {
    title: "Departments with real isolation",
    body: "Split the brain into Engineering, Sales, Legal — each an isolated slice. Access is enforced in the database layer, not the UI: a member without Legal access gets zero Legal results, ever.",
  },
  {
    title: "Agents share your scope",
    body: "Every member gets personal credentials that work in Claude Code, Claude Desktop, Cursor, and any MCP client. Your AI agent sees exactly what you see — nothing more.",
  },
  {
    title: "Fed automatically",
    body: "Connect git repos, Notion, Slack, Google Drive, uploads, or a webhook. Everything becomes markdown in your department repos and syncs into the brain on a schedule.",
  },
  {
    title: "A dedicated instance, not a shared index",
    body: "Every company gets its own isolated server and database. Your knowledge never shares a data plane with anyone else's.",
  },
  {
    title: "No lock-in, by design",
    body: "Your knowledge is markdown in git. Export any department as a git bundle and run open-source gbrain yourself — the brain works the same.",
  },
];

const DEMO = `$ ask "how was the payment outage resolved?"

The payment gateway rate limit was raised from 500 to 1000 rps
after the June 2026 outage [1]. Decision owner: Dana (platform
team) [2]. Revisit when sustained traffic passes 800 rps [2].

Sources:
  [1] engineering/runbooks/payment-rate-limit
  [2] engineering/decisions/d-007-rate-limit

⚠ What your brain doesn't know:
  · No follow-up has been filed since the decision on 2026-06-14.`;

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* hero */}
      <section className="flex flex-col items-center gap-8 px-6 pb-20 pt-24 text-center">
        <p className="rounded-full border border-zinc-300 px-4 py-1 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Powered by open-source{" "}
          <a className="underline" href="https://github.com/garrytan/gbrain">
            gbrain
          </a>
        </p>
        <h1 className="max-w-3xl text-5xl font-semibold tracking-tight">
          Your company brain, hosted and managed
        </h1>
        <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Compandium provisions a private knowledge brain for your company, splits it into
          departments with scoped access, keeps it fed by connectors — and answers your team&apos;s
          questions with citations, from the dashboard or any AI agent.
        </p>
        <div className="flex gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Create your brain
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-zinc-300 px-6 py-3 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* demo */}
      <section className="mx-auto w-full max-w-3xl px-6 pb-20">
        <pre className="overflow-x-auto rounded-2xl bg-zinc-950 p-6 text-sm leading-relaxed text-zinc-100 shadow-xl">
          {DEMO}
        </pre>
        <p className="mt-3 text-center text-sm text-zinc-500">
          Every answer carries its sources — and admits what isn&apos;t documented yet.
        </p>
      </section>

      {/* features */}
      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            <h3 className="mb-2 font-medium">{f.title}</h3>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{f.body}</p>
          </div>
        ))}
      </section>

      {/* how it works */}
      <section className="mx-auto w-full max-w-3xl px-6 pb-20 text-center">
        <h2 className="mb-8 text-2xl font-semibold">Up and running in minutes</h2>
        <ol className="flex flex-col gap-4 text-left sm:flex-row sm:gap-6">
          {[
            ["1. Provision", "Sign up, name your workspace, click once. A dedicated brain instance boots with a shared department ready."],
            ["2. Connect & divide", "Add departments that mirror your confidentiality boundaries. Point connectors at the tools you already use."],
            ["3. Ask everywhere", "Your team asks from the dashboard; your agents connect over MCP with each member's own scoped credentials."],
          ].map(([title, body]) => (
            <li key={title} className="flex-1 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
              <p className="mb-1 font-medium">{title}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-zinc-200 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800">
        <p>
          Compandium hosts and operates{" "}
          <a className="underline" href="https://github.com/garrytan/gbrain">
            gbrain
          </a>{" "}
          (MIT, by Garry Tan) — the engine is open source; we sell the operations. Export your
          departments anytime and run it yourself.
        </p>
      </footer>
    </main>
  );
}
