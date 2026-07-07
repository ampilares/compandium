"use client";

import { slugify } from "@compandium/shared/slug";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await authClient.organization.create({ name, slug });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Could not create the organization");
      return;
    }
    await authClient.organization.setActive({ organizationId: result.data.id });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <h2 className="text-xl font-semibold">Set up your company</h2>
      <p className="text-sm text-zinc-500">
        This creates your workspace. Your company brain gets provisioned next.
      </p>
      <input
        required
        placeholder="Company name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (!slugTouched) setSlug(slugify(e.target.value));
        }}
        className="rounded-lg border border-zinc-300 px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <input
        required
        placeholder="workspace-slug"
        value={slug}
        pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
        onChange={(e) => {
          setSlugTouched(true);
          setSlug(slugify(e.target.value));
        }}
        className="rounded-lg border border-zinc-300 px-4 py-2.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {pending ? "…" : "Create workspace"}
      </button>
    </form>
  );
}
