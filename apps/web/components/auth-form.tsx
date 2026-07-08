"use client";

import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthForm({
  mode,
  initialEmail,
}: {
  mode: "login" | "signup";
  initialEmail?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result =
      mode === "signup"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </h1>
      {mode === "signup" && (
        <input
          required
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-zinc-300 px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}
      <input
        required
        type="email"
        placeholder="Work email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-lg border border-zinc-300 px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <input
        required
        type="password"
        placeholder="Password"
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-lg border border-zinc-300 px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {pending ? "…" : mode === "signup" ? "Sign up" : "Sign in"}
      </button>
      <p className="text-sm text-zinc-500">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link className="underline" href="/login">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Compandium?{" "}
            <Link className="underline" href="/signup">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
