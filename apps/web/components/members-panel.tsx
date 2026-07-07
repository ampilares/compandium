"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface MemberView {
  memberId: string;
  role: string;
  name: string;
  email: string;
  credentialStatus: string | null;
  writeDepartmentId: string | null;
  readDepartmentIds: string[];
}

export interface DeptOption {
  id: string;
  slug: string;
  name: string;
}

export function MembersPanel({
  members,
  departments,
  invitations,
  canManage,
  orgId,
}: {
  members: MemberView[];
  departments: DeptOption[];
  invitations: Array<{ id: string; email: string; status: string }>;
  canManage: boolean;
  orgId: string;
}) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("invite");
    const result = await authClient.organization.inviteMember({
      email: inviteEmail,
      role: "member",
      organizationId: orgId,
    });
    setBusy(null);
    if (result.error) {
      setError(result.error.message ?? "invite failed");
      return;
    }
    setInviteEmail("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {members.map((m) => (
          <MemberRow
            key={m.memberId}
            member={m}
            departments={departments}
            canManage={canManage}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
          />
        ))}
      </ul>

      {canManage && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">Invite a teammate</h2>
          <form onSubmit={invite} className="flex gap-3">
            <input
              required
              type="email"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              disabled={busy === "invite"}
              className="rounded-lg bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
            >
              {busy === "invite" ? "…" : "Invite"}
            </button>
          </form>
          {invitations.filter((i) => i.status === "pending").length > 0 && (
            <ul className="text-sm text-zinc-500">
              {invitations
                .filter((i) => i.status === "pending")
                .map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-1">
                    <span>{i.email}</span>
                    <button
                      className="underline"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${window.location.origin}/accept-invitation/${i.id}`,
                        );
                      }}
                    >
                      copy invite link
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function MemberRow({
  member,
  departments,
  canManage,
  busy,
  setBusy,
  setError,
}: {
  member: MemberView;
  departments: DeptOption[];
  canManage: boolean;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
}) {
  const router = useRouter();
  const [writeId, setWriteId] = useState(member.writeDepartmentId ?? departments[0]?.id ?? "");
  const [readIds, setReadIds] = useState<Set<string>>(new Set(member.readDepartmentIds));
  const [editing, setEditing] = useState(false);

  async function save() {
    setError(null);
    setBusy(member.memberId);
    const res = await fetch(`/api/members/${member.memberId}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ writeDepartmentId: writeId, readDepartmentIds: [...readIds] }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `failed (${res.status})`);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.slug ?? "—";

  return (
    <li className="px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">
            {member.name} <span className="text-sm font-normal text-zinc-400">{member.email}</span>
          </p>
          <p className="text-sm text-zinc-500">
            {member.role} ·{" "}
            {member.credentialStatus === "active" ? (
              <>
                writes <code>{deptName(member.writeDepartmentId)}</code> · reads{" "}
                {member.readDepartmentIds.map((id) => deptName(id)).join(", ")}
              </>
            ) : (
              "no brain access yet"
            )}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {editing ? "Cancel" : "Edit access"}
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
          <label className="flex items-center gap-3 text-sm">
            <span className="w-32 text-zinc-500">Writes to</span>
            <select
              value={writeId}
              onChange={(e) => setWriteId(e.target.value)}
              className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-start gap-3 text-sm">
            <span className="w-32 pt-1 text-zinc-500">Reads</span>
            <div className="flex flex-wrap gap-3">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={readIds.has(d.id) || d.id === writeId}
                    disabled={d.id === writeId}
                    onChange={(e) => {
                      const next = new Set(readIds);
                      if (e.target.checked) next.add(d.id);
                      else next.delete(d.id);
                      setReadIds(next);
                    }}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </div>
          <div>
            <button
              onClick={save}
              disabled={busy === member.memberId}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
            >
              {busy === member.memberId ? "Provisioning…" : "Save access"}
            </button>
            <span className="ml-3 text-xs text-zinc-400">
              Saving re-issues this member&apos;s brain credentials.
            </span>
          </div>
        </div>
      )}
    </li>
  );
}
