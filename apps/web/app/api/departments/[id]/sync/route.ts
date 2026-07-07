import { getDb, schema } from "@compandium/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAgentForOrg } from "@/lib/agent";
import { getOrgContext } from "@/lib/org";

export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const department = await db.query.departments.findFirst({
    where: and(eq(schema.departments.id, id), eq(schema.departments.organizationId, ctx.orgId)),
  });
  if (!department?.sourceId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const agent = await getAgentForOrg(ctx.orgId);
  if (!agent) return NextResponse.json({ error: "brain is not ready" }, { status: 409 });

  try {
    await agent.sync(department.sourceId);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
  await db
    .update(schema.departments)
    .set({ lastSyncedAt: new Date() })
    .where(eq(schema.departments.id, id));
  return NextResponse.json({ ok: true });
}
