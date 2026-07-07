"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface ConnectorView {
  id: string;
  type: string;
  name: string;
  departmentSlug: string;
  schedule: string | null;
  status: string;
  lastRunAt: string | null;
}

export interface DeptOption {
  id: string;
  slug: string;
  name: string;
}

const TYPES = [
  { type: "git", title: "Git repository", blurb: "Import every markdown file from any https git repo (wikis, Obsidian vaults, docs folders). Re-syncs on a schedule." },
  { type: "upload", title: "Markdown upload", blurb: "Drop .md files straight into a department from your browser." },
  { type: "webhook", title: "Webhook", blurb: "A URL for Zapier, IFTTT, or Apple Shortcuts to push notes into a department." },
  { type: "notion", title: "Notion", blurb: "Coming soon", soon: true },
  { type: "slack", title: "Slack", blurb: "Coming soon", soon: true },
  { type: "gdrive", title: "Google Drive", blurb: "Coming soon", soon: true },
] as const;

export function ConnectorsPanel({
  connectors,
  departments,
  canManage,
}: {
  connectors: ConnectorView[];
  departments: DeptOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, method: "POST" | "DELETE") {
    setError(null);
    setBusy(id);
    const res = await fetch(`/api/connectors/${id}`, { method });
    setBusy(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `failed (${res.status})`);
      return;
    }
    setNotice(method === "POST" ? "Sync queued." : "Connector removed.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}

      {connectors.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {connectors.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="font-medium">
                  {c.name}{" "}
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-500 dark:bg-zinc-800">
                    {c.type}
                  </span>
                </p>
                <p className="text-sm text-zinc-500">
                  → {c.departmentSlug}
                  {c.schedule ? ` · every ${c.schedule}` : ""} ·{" "}
                  {c.status === "error" ? (
                    <span className="text-red-600">last run failed</span>
                  ) : c.lastRunAt ? (
                    `last run ${new Date(c.lastRunAt).toLocaleString()}`
                  ) : (
                    "never run"
                  )}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  {c.type !== "upload" && c.type !== "webhook" && (
                    <button
                      onClick={() => act(c.id, "POST")}
                      disabled={busy === c.id}
                      className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      Sync now
                    </button>
                  )}
                  <button
                    onClick={() => confirm(`Remove connector "${c.name}"?`) && act(c.id, "DELETE")}
                    disabled={busy === c.id}
                    className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TYPES.map((t) => (
            <div
              key={t.type}
              className={`rounded-xl border border-zinc-200 p-5 dark:border-zinc-800 ${"soon" in t && t.soon ? "opacity-50" : ""}`}
            >
              <h3 className="font-medium">{t.title}</h3>
              <p className="mb-3 mt-1 text-sm text-zinc-500">{t.blurb}</p>
              {!("soon" in t && t.soon) && (
                <button
                  onClick={() => setOpenForm(openForm === t.type ? null : t.type)}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {openForm === t.type ? "Close" : "Add"}
                </button>
              )}
              {openForm === t.type && (
                <div className="mt-4">
                  {t.type === "git" && (
                    <GitForm departments={departments} onDone={() => { setOpenForm(null); router.refresh(); }} setError={setError} setNotice={setNotice} />
                  )}
                  {t.type === "upload" && (
                    <UploadForm departments={departments} onDone={() => { setOpenForm(null); router.refresh(); }} setError={setError} setNotice={setNotice} />
                  )}
                  {t.type === "webhook" && (
                    <WebhookForm departments={departments} onDone={() => router.refresh()} setError={setError} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeptSelect({
  departments,
  value,
  onChange,
}: {
  departments: DeptOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
    >
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          → {d.name}
        </option>
      ))}
    </select>
  );
}

function GitForm({
  departments,
  onDone,
  setError,
  setNotice,
}: {
  departments: DeptOption[];
  onDone: () => void;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const [repoUrl, setRepoUrl] = useState("");
  const [schedule, setSchedule] = useState("6h");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/connectors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "git",
        name: repoUrl.replace(/^https:\/\//, "").slice(0, 60),
        departmentId,
        schedule,
        config: { repoUrl },
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `failed (${res.status})`);
      return;
    }
    setNotice("Git connector added — first import queued.");
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input
        required
        placeholder="https://github.com/org/repo"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      <div className="flex gap-2">
        <DeptSelect departments={departments} value={departmentId} onChange={setDepartmentId} />
        <select
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="30m">every 30m</option>
          <option value="6h">every 6h</option>
          <option value="24h">every 24h</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {busy ? "Validating…" : "Connect repository"}
      </button>
    </form>
  );
}

function UploadForm({
  departments,
  onDone,
  setError,
  setNotice,
}: {
  departments: DeptOption[];
  onDone: () => void;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const form = new FormData();
    for (const f of files) form.append("files", f);
    const res = await fetch(`/api/departments/${departmentId}/upload`, {
      method: "POST",
      body: form,
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `failed (${res.status})`);
      return;
    }
    setNotice(`Uploaded ${files.length} file(s) — synced into the brain.`);
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <DeptSelect departments={departments} value={departmentId} onChange={setDepartmentId} />
      <input
        required
        type="file"
        multiple
        accept=".md,.markdown,.txt"
        onChange={(e) => setFiles(e.target.files)}
        className="text-sm"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {busy ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}

function WebhookForm({
  departments,
  onDone,
  setError,
}: {
  departments: DeptOption[];
  onDone: () => void;
  setError: (v: string | null) => void;
}) {
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [name, setName] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/connectors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "webhook", name: name || "webhook", departmentId }),
    });
    setBusy(false);
    const body = (await res.json().catch(() => null)) as
      | { error?: string; webhookPath?: string }
      | null;
    if (!res.ok || !body?.webhookPath) {
      setError(body?.error ?? `failed (${res.status})`);
      return;
    }
    setUrl(`${window.location.origin}${body.webhookPath}`);
    onDone();
  }

  if (url) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-zinc-500">
          POST markdown (or JSON <code>{"{title, content}"}</code>) to:
        </p>
        <pre className="overflow-x-auto rounded bg-zinc-950 p-3 text-xs text-zinc-100">{url}</pre>
        <button className="self-start text-xs underline" onClick={() => navigator.clipboard.writeText(url)}>
          copy URL
        </button>
        <p className="text-xs text-amber-600">Shown once — store it in your automation tool now.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input
        placeholder="Name (e.g. Zapier notes)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      <DeptSelect departments={departments} value={departmentId} onChange={setDepartmentId} />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {busy ? "Creating…" : "Create webhook"}
      </button>
    </form>
  );
}
