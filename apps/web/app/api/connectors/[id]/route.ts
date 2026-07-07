import { getDb, schema } from "@compandium/db";
import { QUEUES } from "@compandium/shared/queues";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getOrgContext, isAdmin } from "@/lib/org";
import { getQueue } from "@/lib/queue";

async function findConnector(orgId: string, id: string) {
  const db = getDb();
  return db.query.connectors.findFirst({
    where: and(eq(schema.connectors.id, id), eq(schema.connectors.organizationId, orgId)),
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const connector = await findConnector(ctx.orgId, id);
  if (!connector) return NextResponse.json({ error: "not found" }, { status: 404 });
  const db = getDb();
  const runs = await db.query.connectorRuns.findMany({
    where: eq(schema.connectorRuns.connectorId, id),
    orderBy: [desc(schema.connectorRuns.startedAt)],
    limit: 20,
  });
  return NextResponse.json({
    connector: {
      id: connector.id,
      type: connector.type,
      name: connector.name,
      schedule: connector.schedule,
      status: connector.status,
      lastRunAt: connector.lastRunAt,
    },
    runs,
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // manual "sync now"
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const connector = await findConnector(ctx.orgId, id);
  if (!connector) return NextResponse.json({ error: "not found" }, { status: 404 });
  const queue = await getQueue();
  await queue.send(QUEUES.connectorSync, { connectorId: id }, { singletonKey: id });
  return NextResponse.json({ ok: true }, { status: 202 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(ctx)) return NextResponse.json({ error: "admin only" }, { status: 403 });
  const { id } = await params;
  const connector = await findConnector(ctx.orgId, id);
  if (!connector) return NextResponse.json({ error: "not found" }, { status: 404 });
  const db = getDb();
  await db.delete(schema.connectors).where(eq(schema.connectors.id, id));
  await db.insert(schema.auditLog).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    action: "connector.deleted",
    target: id,
    meta: { type: connector.type, name: connector.name },
  });
  return NextResponse.json({ ok: true });
}
