import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <p className="rounded-full border border-zinc-300 px-4 py-1 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        Powered by gbrain
      </p>
      <h1 className="max-w-3xl text-5xl font-semibold tracking-tight">
        Your company brain, hosted and managed
      </h1>
      <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
        Compandium provisions a private knowledge brain for your company, splits
        it into departments with scoped access, keeps it fed by connectors — and
        answers your team&apos;s questions with citations, from the dashboard or
        any AI agent.
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
    </main>
  );
}
