import { getDb, schema } from "@compandium/db";
import { encryptSecret } from "@compandium/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAgentForOrg } from "@/lib/agent";
import { getOrgContext, isAdmin } from "@/lib/org";

/**
 * Set a member's brain access: one write department + N read departments.
 * gbrain clients are immutable in scope, so a change = revoke + re-register.
 */
export async function POST(req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(ctx)) return NextResponse.json({ error: "admin only" }, { status: 403 });

  const { memberId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    writeDepartmentId?: string;
    readDepartmentIds?: string[];
  };
  if (!body.writeDepartmentId || !Array.isArray(body.readDepartmentIds)) {
    return NextResponse.json(
      { error: "writeDepartmentId and readDepartmentIds[] required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const member = await db.query.member.findFirst({
    where: and(eq(schema.member.id, memberId), eq(schema.member.organizationId, ctx.orgId)),
  });
  if (!member) return NextResponse.json({ error: "member not found" }, { status: 404 });

  // read set always includes the write department
  const readIds = [...new Set([body.writeDepartmentId, ...body.readDepartmentIds])];
  const departments = await db.query.departments.findMany({
    where: and(
      eq(schema.departments.organizationId, ctx.orgId),
      inArray(schema.departments.id, readIds),
    ),
  });
  if (departments.length !== readIds.length) {
    return NextResponse.json({ error: "unknown department in selection" }, { status: 400 });
  }
  if (departments.some((d) => d.status !== "ready" || !d.sourceId)) {
    return NextResponse.json({ error: "a selected department is not ready" }, { status: 409 });
  }
  const writeDept = departments.find((d) => d.id === body.writeDepartmentId)!;

  const agent = await getAgentForOrg(ctx.orgId);
  if (!agent) return NextResponse.json({ error: "brain is not ready" }, { status: 409 });

  const existing = await db.query.memberCredentials.findFirst({
    where: eq(schema.memberCredentials.memberId, memberId),
  });
  if (existing?.gbrainClientId) {
    await agent.revokeMember(existing.gbrainClientId).catch(() => {
      // stale client id (e.g. tenant rebuilt) — registration below is what matters
    });
  }

  const clientName = `member-${memberId.slice(0, 12).toLowerCase()}`.replace(/[^a-z0-9._-]/g, "-");
  let creds: { clientId: string; clientSecret: string };
  try {
    creds = await agent.registerMember({
      name: clientName,
      source: writeDept.sourceId!,
      federatedRead: departments.map((d) => d.sourceId!),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  const values = {
    organizationId: ctx.orgId,
    memberId,
    gbrainClientId: creds.clientId,
    secretEncrypted: encryptSecret(creds.clientSecret),
    writeDepartmentId: body.writeDepartmentId,
    readDepartmentIds: readIds,
    status: "active" as const,
    updatedAt: new Date(),
  };
  if (existing) {
    await db
      .update(schema.memberCredentials)
      .set(values)
      .where(eq(schema.memberCredentials.id, existing.id));
  } else {
    await db.insert(schema.memberCredentials).values(values);
  }

  await db.insert(schema.auditLog).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    action: "member.access_updated",
    target: memberId,
    meta: { write: writeDept.slug, read: departments.map((d) => d.slug) },
  });

  return NextResponse.json({ ok: true });
}
