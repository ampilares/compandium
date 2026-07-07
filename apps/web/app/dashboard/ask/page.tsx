"use client";

import { useState } from "react";

interface Exchange {
  question: string;
  answer?: string;
  error?: string;
  pending: boolean;
}

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"think" | "search">("think");
  const [history, setHistory] = useState<Exchange[]>([]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    setHistory((h) => [...h, { question: q, pending: true }]);
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: q, mode }),
    });
    const body = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
    setHistory((h) =>
      h.map((x, i) =>
        i === h.length - 1
          ? { ...x, pending: false, answer: body.answer, error: res.ok ? undefined : body.error }
          : x,
      ),
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Ask your brain</h1>
        <p className="text-sm text-zinc-500">
          Synthesized answers with citations and honest gaps — scoped to the departments you can
          read.
        </p>
      </div>

      <form onSubmit={ask} className="flex gap-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What is the payment rate limit and why?"
          className="flex-1 rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "think" | "search")}
          className="rounded-lg border border-zinc-300 px-3 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          title="Think = synthesized answer (needs an AI key). Search = raw retrieval."
        >
          <option value="think">Think</option>
          <option value="search">Search</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          Ask
        </button>
      </form>

      <div className="flex flex-col gap-4">
        {[...history].reverse().map((x, i) => (
          <article
            key={history.length - 1 - i}
            className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
          >
            <p className="mb-3 font-medium">{x.question}</p>
            {x.pending ? (
              <p className="flex items-center gap-2 text-sm text-zinc-500">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                Thinking (retrieval + synthesis)…
              </p>
            ) : x.error ? (
              <p className="text-sm text-red-600">{x.error}</p>
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {x.answer}
              </pre>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
