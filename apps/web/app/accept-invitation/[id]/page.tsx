"use client";

import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function AcceptInvitationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    setError(null);
    setBusy(true);
    const result = await authClient.organization.acceptInvitation({ invitationId: id });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "could not accept the invitation");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold">Join your team&apos;s brain</h1>
      {isPending ? (
        <p className="text-zinc-500">Loading…</p>
      ) : session ? (
        <>
          <p className="text-zinc-500">
            Signed in as {session.user.email}. Accept the invitation to join the workspace.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={accept}
            disabled={busy}
            className="rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {busy ? "Joining…" : "Accept invitation"}
          </button>
        </>
      ) : (
        <>
          <p className="text-zinc-500">Create an account (or sign in) first, then reopen this link.</p>
          <div className="flex gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white dark:bg-white dark:text-zinc-900"
            >
              Sign up
            </Link>
            <Link href="/login" className="rounded-lg border border-zinc-300 px-6 py-3 dark:border-zinc-700">
              Sign in
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
