import { getDb, schema } from "@compandium/db";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";

export default async function ActivityPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/dashboard");

  const db = getDb();
  const entries = await db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      target: schema.auditLog.target,
      meta: schema.auditLog.meta,
      createdAt: schema.auditLog.createdAt,
      actorEmail: schema.user.email,
    })
    .from(schema.auditLog)
    .leftJoin(schema.user, eq(schema.auditLog.actorUserId, schema.user.id))
    .where(eq(schema.auditLog.organizationId, ctx.orgId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(100);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-zinc-500">Who did what, most recent first.</p>
      </div>
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
        {entries.length === 0 && <li className="px-5 py-4 text-zinc-500">Nothing yet.</li>}
        {entries.map((e) => (
          <li key={e.id} className="flex items-baseline justify-between gap-4 px-5 py-3">
            <span>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
                {e.action}
              </code>{" "}
              {e.target && <span className="font-mono text-xs text-zinc-500">{e.target}</span>}
              {e.actorEmail && <span className="text-zinc-500"> — {e.actorEmail}</span>}
            </span>
            <time className="shrink-0 text-xs text-zinc-400">
              {e.createdAt.toLocaleString()}
            </time>
          </li>
        ))}
      </ul>
    </main>
  );
}
