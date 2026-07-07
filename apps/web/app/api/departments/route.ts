import { getDb, schema } from "@compandium/db";
import { isValidSlug, slugify } from "@compandium/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAgentForOrg } from "@/lib/agent";
import { getDepartments, getOrgContext, isAdmin } from "@/lib/org";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const departments = await getDepartments(ctx.orgId);
  return NextResponse.json({ departments });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(ctx)) return NextResponse.json({ error: "admin only" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { name?: string; slug?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const slug = body.slug?.trim() || slugify(name);
  if (!isValidSlug(slug)) return NextResponse.json({ error: "invalid slug" }, { status: 400 });

  const agent = await getAgentForOrg(ctx.orgId);
  if (!agent) {
    return NextResponse.json({ error: "brain is not ready yet" }, { status: 409 });
  }

  const db = getDb();
  const inserted = await db
    .insert(schema.departments)
    .values({ organizationId: ctx.orgId, slug, name, status: "creating" })
    .onConflictDoNothing()
    .returning({ id: schema.departments.id });
  const departmentId = inserted[0]?.id;
  if (!departmentId) {
    return NextResponse.json({ error: "department already exists" }, { status: 409 });
  }

  try {
    await agent.createDepartment(slug, name);
    await db
      .update(schema.departments)
      .set({ status: "ready", sourceId: slug })
      .where(eq(schema.departments.id, departmentId));
  } catch (e) {
    await db
      .update(schema.departments)
      .set({ status: "error" })
      .where(eq(schema.departments.id, departmentId));
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  await db.insert(schema.auditLog).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    action: "department.created",
    target: slug,
  });

  return NextResponse.json({ ok: true, id: departmentId, slug }, { status: 201 });
}
