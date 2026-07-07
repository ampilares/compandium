import { getDb, schema } from "@compandium/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAgentForOrg } from "@/lib/agent";
import { getOrgContext, isAdmin } from "@/lib/org";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(ctx)) return NextResponse.json({ error: "admin only" }, { status: 403 });

  const { id } = await params;
  const db = getDb();
  const department = await db.query.departments.findFirst({
    where: and(eq(schema.departments.id, id), eq(schema.departments.organizationId, ctx.orgId)),
  });
  if (!department) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (department.slug === "shared") {
    return NextResponse.json({ error: "the shared department cannot be deleted" }, { status: 400 });
  }

  const agent = await getAgentForOrg(ctx.orgId);
  if (!agent) return NextResponse.json({ error: "brain is not ready" }, { status: 409 });

  try {
    await agent.removeDepartment(department.slug);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  await db.delete(schema.departments).where(eq(schema.departments.id, id));
  await db.insert(schema.auditLog).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    action: "department.deleted",
    target: department.slug,
  });

  return NextResponse.json({ ok: true });
}
