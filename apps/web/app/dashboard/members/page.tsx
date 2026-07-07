import { getDb, schema } from "@compandium/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { MembersPanel } from "@/components/members-panel";
import { getDepartments, getOrgContext, isAdmin } from "@/lib/org";

export default async function MembersPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/dashboard");

  const db = getDb();
  const [members, departments, invitations] = await Promise.all([
    db
      .select({
        memberId: schema.member.id,
        role: schema.member.role,
        name: schema.user.name,
        email: schema.user.email,
        credentialStatus: schema.memberCredentials.status,
        writeDepartmentId: schema.memberCredentials.writeDepartmentId,
        readDepartmentIds: schema.memberCredentials.readDepartmentIds,
      })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
      .leftJoin(schema.memberCredentials, eq(schema.memberCredentials.memberId, schema.member.id))
      .where(eq(schema.member.organizationId, ctx.orgId)),
    getDepartments(ctx.orgId),
    db.query.invitation.findMany({
      where: eq(schema.invitation.organizationId, ctx.orgId),
    }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-sm text-zinc-500">
          Each member gets their own brain credentials scoped to the departments you pick.
        </p>
      </div>
      <MembersPanel
        orgId={ctx.orgId}
        canManage={isAdmin(ctx)}
        members={members.map((m) => ({
          ...m,
          readDepartmentIds: m.readDepartmentIds ?? [],
        }))}
        departments={departments
          .filter((d) => d.status === "ready")
          .map((d) => ({ id: d.id, slug: d.slug, name: d.name }))}
        invitations={invitations.map((i) => ({ id: i.id, email: i.email, status: i.status }))}
      />
    </main>
  );
}
