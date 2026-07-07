import { PULL_CONNECTORS, PUSH_CONNECTORS } from "@compandium/connectors";
import { getDb, schema } from "@compandium/db";
import { encryptSecret, generateToken } from "@compandium/shared";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getOrgContext, isAdmin } from "@/lib/org";
import { getQueue } from "@/lib/queue";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  const rows = await db
    .select({
      id: schema.connectors.id,
      type: schema.connectors.type,
      name: schema.connectors.name,
      departmentId: schema.connectors.departmentId,
      departmentSlug: schema.departments.slug,
      schedule: schema.connectors.schedule,
      status: schema.connectors.status,
      lastRunAt: schema.connectors.lastRunAt,
    })
    .from(schema.connectors)
    .innerJoin(schema.departments, eq(schema.connectors.departmentId, schema.departments.id))
    .where(eq(schema.connectors.organizationId, ctx.orgId))
    .orderBy(desc(schema.connectors.createdAt));
  return NextResponse.json({ connectors: rows });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(ctx)) return NextResponse.json({ error: "admin only" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    type?: string;
    name?: string;
    departmentId?: string;
    schedule?: string | null;
    config?: Record<string, unknown>;
  };
  const type = body.type ?? "";
  const impl = PULL_CONNECTORS[type] ?? PUSH_CONNECTORS[type];
  if (!impl) return NextResponse.json({ error: `unknown connector type "${type}"` }, { status: 400 });
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!body.departmentId) {
    return NextResponse.json({ error: "departmentId required" }, { status: 400 });
  }
  if (body.schedule && !/^\d+(m|h)$/.test(body.schedule)) {
    return NextResponse.json({ error: "schedule must look like 30m or 6h" }, { status: 400 });
  }

  const db = getDb();
  const department = await db.query.departments.findFirst({
    where: eq(schema.departments.id, body.departmentId),
  });
  if (!department || department.organizationId !== ctx.orgId || department.status !== "ready") {
    return NextResponse.json({ error: "department not found or not ready" }, { status: 400 });
  }

  // webhook connectors get a URL token generated server-side
  const rawConfig = { ...(body.config ?? {}) };
  if (type === "webhook") rawConfig.token = generateToken(24);

  const parsed = impl.configSchema.safeParse(rawConfig);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  if ("validate" in impl) {
    try {
      await impl.validate(parsed.data as never);
    } catch (e) {
      return NextResponse.json({ error: String(e).slice(0, 500) }, { status: 400 });
    }
  }

  const inserted = await db
    .insert(schema.connectors)
    .values({
      organizationId: ctx.orgId,
      departmentId: body.departmentId,
      type: type as never,
      name: body.name.trim(),
      schedule: body.schedule ?? null,
      configEncrypted: encryptSecret(JSON.stringify(parsed.data)),
    })
    .returning({ id: schema.connectors.id });
  const connectorId = inserted[0]!.id;

  // pull connectors: kick off the first sync right away
  if (PULL_CONNECTORS[type]) {
    const queue = await getQueue();
    await queue.send("connector-sync", { connectorId }, { retryLimit: 2, retryDelay: 60 });
  }

  await db.insert(schema.auditLog).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    action: "connector.created",
    target: connectorId,
    meta: { type, department: department.slug },
  });

  const extras: Record<string, unknown> = {};
  if (type === "webhook") {
    extras.webhookPath = `/api/hooks/${connectorId}/${rawConfig.token as string}`;
  }
  return NextResponse.json({ ok: true, id: connectorId, ...extras }, { status: 201 });
}
