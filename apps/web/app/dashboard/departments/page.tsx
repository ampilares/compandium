import { DepartmentsPanel } from "@/components/departments-panel";
import { getDepartments, getOrgContext, isAdmin } from "@/lib/org";
import { redirect } from "next/navigation";

export default async function DepartmentsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/dashboard");
  const departments = await getDepartments(ctx.orgId);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Departments</h1>
        <p className="text-sm text-zinc-500">
          Each department is an isolated slice of your brain. Access is granted per member.
        </p>
      </div>
      <DepartmentsPanel
        canManage={isAdmin(ctx)}
        departments={departments.map((d) => ({
          id: d.id,
          slug: d.slug,
          name: d.name,
          status: d.status,
          lastSyncedAt: d.lastSyncedAt?.toISOString() ?? null,
          pageCount: d.pageCount,
        }))}
      />
    </main>
  );
}
