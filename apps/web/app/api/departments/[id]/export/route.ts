import { getDb, schema } from "@compandium/db";
import { decryptSecret } from "@compandium/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getInstance, getOrgContext } from "@/lib/org";

export const maxDuration = 300;

/** Stream the department's git bundle — the no-lock-in export. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const department = await db.query.departments.findFirst({
    where: and(eq(schema.departments.id, id), eq(schema.departments.organizationId, ctx.orgId)),
  });
  if (!department?.sourceId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const instance = await getInstance(ctx.orgId);
  if (!instance?.agentUrl || !instance.agentTokenEncrypted) {
    return NextResponse.json({ error: "brain is not ready" }, { status: 409 });
  }

  const upstream = await fetch(`${instance.agentUrl}/v1/export/${department.sourceId}`, {
    headers: { authorization: `Bearer ${decryptSecret(instance.agentTokenEncrypted)}` },
    signal: AbortSignal.timeout(240_000),
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `export failed (${upstream.status})` }, { status: 502 });
  }

  await db.insert(schema.auditLog).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    action: "department.exported",
    target: department.slug,
  });

  return new Response(upstream.body, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${department.slug}.bundle"`,
    },
  });
}
