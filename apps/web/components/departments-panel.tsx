"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface DepartmentView {
  id: string;
  slug: string;
  name: string;
  status: string;
  lastSyncedAt: string | null;
  pageCount: number;
}

export function DepartmentsPanel({
  departments,
  canManage,
}: {
  departments: DepartmentView[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending("create");
    const res = await fetch("/api/departments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setPending(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `failed (${res.status})`);
      return;
    }
    setName("");
    router.refresh();
  }

  async function act(id: string, method: string, path: string) {
    setError(null);
    setPending(id);
    const res = await fetch(path, { method });
    setPending(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `failed (${res.status})`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {departments.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="font-medium">
                {d.name} <span className="font-mono text-xs text-zinc-400">{d.slug}</span>
              </p>
              <p className="text-sm text-zinc-500">
                {d.status === "ready" ? (
                  <>
                    {d.pageCount} pages · last sync{" "}
                    {d.lastSyncedAt ? new Date(d.lastSyncedAt).toLocaleString() : "never"}
                  </>
                ) : (
                  d.status
                )}
              </p>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <a
                  href={`/api/departments/${d.id}/export`}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  title="Download this department as a portable git bundle"
                >
                  Export
                </a>
                <button
                  onClick={() => act(d.id, "POST", `/api/departments/${d.id}/sync`)}
                  disabled={pending === d.id}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {pending === d.id ? "…" : "Sync"}
                </button>
                {d.slug !== "shared" && (
                  <button
                    onClick={() => {
                      if (confirm(`Delete department "${d.name}" and its brain content?`)) {
                        void act(d.id, "DELETE", `/api/departments/${d.id}`);
                      }
                    }}
                    disabled={pending === d.id}
                    className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <form onSubmit={create} className="flex gap-3">
          <input
            required
            placeholder="New department (e.g. Engineering)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={pending === "create"}
            className="rounded-lg bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {pending === "create" ? "Creating…" : "Add department"}
          </button>
        </form>
      )}
    </div>
  );
}
