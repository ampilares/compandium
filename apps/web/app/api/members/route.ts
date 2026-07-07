import { getDb, schema } from "@compandium/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org";

/** Org members with their user info and brain-access summary. */
export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const rows = await db
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
    .where(eq(schema.member.organizationId, ctx.orgId));

  return NextResponse.json({ members: rows });
}
