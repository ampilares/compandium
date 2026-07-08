"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Email-first conversion form: stores the lead immediately, then funnels the
 * visitor into signup with the email prefilled — one field, two outcomes.
 */
export function LeadCapture({
  source,
  buttonLabel = "Create your brain",
  align = "center",
}: {
  source: "hero" | "footer-cta" | "pricing";
  buttonLabel?: string;
  align?: "center" | "start";
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    // capture the lead even if the visitor abandons signup
    await fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, source }),
    }).catch(() => null);
    router.push(`/signup?email=${encodeURIComponent(email)}`);
  }

  return (
    <form
      onSubmit={submit}
      className={`flex w-full max-w-md flex-col gap-3 sm:flex-row ${align === "center" ? "mx-auto" : ""}`}
    >
      <input
        required
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="h-12 flex-1 rounded-xl border border-white/15 bg-white/5 px-4 text-white placeholder:text-zinc-500 backdrop-blur focus:border-indigo-400/60 focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-12 shrink-0 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-400 hover:to-violet-400 disabled:opacity-60"
      >
        {pending ? "One sec…" : buttonLabel}
      </button>
    </form>
  );
}
