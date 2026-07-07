import { webhookConfigSchema } from "@compandium/connectors";
import { getDb, schema } from "@compandium/db";
import { AgentClient, decryptSecret } from "@compandium/shared";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 120;
const MAX_BODY = 512_000;

/**
 * Public inbound webhook (Zapier / IFTTT / Apple Shortcuts).
 * Auth = unguessable token in the URL, checked against the connector config.
 * Body: markdown text, or JSON { title?, path?, content }.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
) {
  const { id, token } = await params;
  const db = getDb();
  const connector = await db.query.connectors.findFirst({
    where: eq(schema.connectors.id, id),
  });
  if (!connector || connector.type !== "webhook" || connector.status === "paused") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const config = webhookConfigSchema.safeParse(
    connector.configEncrypted ? JSON.parse(decryptSecret(connector.configEncrypted)) : {},
  );
  if (!config.success) return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  const a = Buffer.from(token);
  const b = Buffer.from(config.data.token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  if (!raw.trim()) return NextResponse.json({ error: "empty payload" }, { status: 400 });

  let content = raw;
  let path: string | undefined;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw) as { title?: string; path?: string; content?: string };
      if (typeof parsed.content !== "string" || !parsed.content.trim()) {
        return NextResponse.json({ error: "JSON body needs a content field" }, { status: 400 });
      }
      content = parsed.title ? `# ${parsed.title}\n\n${parsed.content}` : parsed.content;
      if (parsed.path && /^[a-zA-Z0-9/_-]{1,160}$/.test(parsed.path) && !parsed.path.includes("..")) {
        path = `inbox/${parsed.path.replace(/\.md$/i, "")}.md`;
      }
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  path ??= `inbox/${stamp}-${Math.random().toString(36).slice(2, 8)}.md`;

  const [department, instance] = await Promise.all([
    db.query.departments.findFirst({ where: eq(schema.departments.id, connector.departmentId) }),
    db.query.instances.findFirst({
      where: eq(schema.instances.organizationId, connector.organizationId),
    }),
  ]);
  if (!department?.sourceId || !instance?.agentUrl || !instance.agentTokenEncrypted) {
    return NextResponse.json({ error: "brain not ready" }, { status: 503 });
  }
  const agent = new AgentClient(instance.agentUrl, decryptSecret(instance.agentTokenEncrypted));
  try {
    await agent.putFiles({
      source: department.sourceId,
      files: [{ path, content }],
      message: `webhook: ${connector.name}`,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 502 });
  }
  await db
    .update(schema.connectors)
    .set({ lastRunAt: new Date() })
    .where(eq(schema.connectors.id, id));
  return NextResponse.json({ ok: true, path });
}
