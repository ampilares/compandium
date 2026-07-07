import { getDb, schema } from "@compandium/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getInstance, getOrgContext, isAdmin } from "@/lib/org";
import { getQueue } from "@/lib/queue";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const instance = await getInstance(ctx.orgId);
  if (!instance) return NextResponse.json({ instance: null });
  return NextResponse.json({
    instance: {
      id: instance.id,
      status: instance.status,
      publicUrl: instance.publicUrl,
      provider: instance.provider,
      region: instance.region,
      lastHealthyAt: instance.lastHealthyAt,
      lastError: instance.lastError,
      createdAt: instance.createdAt,
    },
  });
}

export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(ctx)) return NextResponse.json({ error: "admin only" }, { status: 403 });

  const db = getDb();
  const existing = await getInstance(ctx.orgId);
  // ready/provisioning: nothing to do. queued/error: (re-)enqueue — the saga
  // is idempotent, and a queued row with no live job (lost schema, crashed
  // worker) would otherwise be stuck forever.
  if (existing && (existing.status === "ready" || existing.status === "provisioning")) {
    return NextResponse.json({ instance: { id: existing.id, status: existing.status } });
  }

  const provider = (process.env.COMPANDIUM_PROVISIONER ?? "fly") as "fly" | "docker";
  const region = process.env.COMPANDIUM_DEFAULT_REGION ?? "iad";

  let instanceId: string;
  if (existing) {
    // retry a failed provision
    await db
      .update(schema.instances)
      .set({ status: "queued", lastError: null, updatedAt: new Date() })
      .where(eq(schema.instances.id, existing.id));
    instanceId = existing.id;
  } else {
    const inserted = await db
      .insert(schema.instances)
      .values({ organizationId: ctx.orgId, provider, region })
      .returning({ id: schema.instances.id });
    instanceId = inserted[0]!.id;
  }

  const queue = await getQueue();
  await queue.send(
    "provision-instance",
    { instanceId, organizationId: ctx.orgId },
    { retryLimit: 3, retryDelay: 30, expireInSeconds: 900 },
  );

  await db.insert(schema.auditLog).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    action: "instance.provision_requested",
    target: instanceId,
  });

  return NextResponse.json({ instance: { id: instanceId, status: "queued" } }, { status: 202 });
}
