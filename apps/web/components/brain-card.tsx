"use client";

import { useCallback, useEffect, useState } from "react";

interface InstanceView {
  id: string;
  status: "queued" | "provisioning" | "ready" | "error" | "suspended";
  publicUrl: string | null;
  provider: string;
  region: string;
  lastHealthyAt: string | null;
  lastError: string | null;
}

const POLLING_STATUSES = new Set(["queued", "provisioning"]);

export function BrainCard({
  initialInstance,
  canProvision,
}: {
  initialInstance: InstanceView | null;
  canProvision: boolean;
}) {
  const [instance, setInstance] = useState<InstanceView | null>(initialInstance);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/instance");
    if (res.ok) {
      const data = (await res.json()) as { instance: InstanceView | null };
      setInstance(data.instance);
    }
  }, []);

  useEffect(() => {
    if (!instance || !POLLING_STATUSES.has(instance.status)) return;
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [instance, refresh]);

  async function provision() {
    setError(null);
    setPending(true);
    const res = await fetch("/api/instance", { method: "POST" });
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `request failed (${res.status})`);
      return;
    }
    await refresh();
  }

  if (!instance) {
    return (
      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="mb-1 font-medium">Company brain</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Provision your dedicated brain: an isolated gbrain instance with its own database,
          MCP endpoint, and a <code>shared</code> department to start with.
        </p>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {canProvision ? (
          <button
            onClick={provision}
            disabled={pending}
            className="rounded-lg bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {pending ? "Starting…" : "Provision your brain"}
          </button>
        ) : (
          <p className="text-sm text-zinc-500">Ask a workspace admin to provision the brain.</p>
        )}
      </section>
    );
  }

  if (POLLING_STATUSES.has(instance.status)) {
    return (
      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="mb-1 font-medium">Company brain</h2>
        <p className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          {instance.status === "queued" ? "Queued for provisioning…" : "Provisioning your brain…"}
          <span className="text-zinc-400">(usually 2–5 minutes)</span>
        </p>
      </section>
    );
  }

  if (instance.status === "error") {
    return (
      <section className="rounded-xl border border-red-200 p-6 dark:border-red-900">
        <h2 className="mb-1 font-medium">Company brain</h2>
        <p className="mb-2 text-sm text-red-600">Provisioning failed.</p>
        {instance.lastError && (
          <pre className="mb-4 max-h-32 overflow-auto rounded bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
            {instance.lastError}
          </pre>
        )}
        {canProvision && (
          <button
            onClick={provision}
            disabled={pending}
            className="rounded-lg bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {pending ? "Retrying…" : "Retry"}
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Company brain</h2>
        <span className="flex items-center gap-2 text-sm text-emerald-600">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> ready
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Brain URL</dt>
          <dd className="font-mono text-xs">{instance.publicUrl}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">MCP endpoint (for AI agents)</dt>
          <dd className="font-mono text-xs">{instance.publicUrl}/mcp</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Provider / region</dt>
          <dd>
            {instance.provider} · {instance.region}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Last healthy</dt>
          <dd>
            {instance.lastHealthyAt ? new Date(instance.lastHealthyAt).toLocaleString() : "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
