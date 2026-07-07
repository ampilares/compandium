import { getDb, schema } from "@compandium/db";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ConnectorsPanel } from "@/components/connectors-panel";
import { getDepartments, getOrgContext, isAdmin } from "@/lib/org";

export default async function ConnectorsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/dashboard");

  const db = getDb();
  const [connectors, departments] = await Promise.all([
    db
      .select({
        id: schema.connectors.id,
        type: schema.connectors.type,
        name: schema.connectors.name,
        departmentSlug: schema.departments.slug,
        schedule: schema.connectors.schedule,
        status: schema.connectors.status,
        lastRunAt: schema.connectors.lastRunAt,
      })
      .from(schema.connectors)
      .innerJoin(schema.departments, eq(schema.connectors.departmentId, schema.departments.id))
      .where(eq(schema.connectors.organizationId, ctx.orgId))
      .orderBy(desc(schema.connectors.createdAt)),
    getDepartments(ctx.orgId),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Connectors</h1>
        <p className="text-sm text-zinc-500">
          Keep departments fed automatically. Each connector writes markdown into one department —
          the department&apos;s access rules apply to everything it brings in.
        </p>
      </div>
      <ConnectorsPanel
        canManage={isAdmin(ctx)}
        departments={departments
          .filter((d) => d.status === "ready")
          .map((d) => ({ id: d.id, slug: d.slug, name: d.name }))}
        connectors={connectors.map((c) => ({
          ...c,
          lastRunAt: c.lastRunAt?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
