"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
      className="text-sm text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
    >
      Sign out
    </button>
  );
}
