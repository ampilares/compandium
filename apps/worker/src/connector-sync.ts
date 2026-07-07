import { PULL_CONNECTORS, type SourceRecord } from "@compandium/connectors";
import { getDb, schema } from "@compandium/db";
import { AgentClient, decryptSecret } from "@compandium/shared";
import { and, eq } from "drizzle-orm";

const FILE_BATCH = 300;

function withFrontmatter(record: SourceRecord): string | null {
  if (record.markdown === null) return null;
  if (!record.metadata || record.markdown.startsWith("---\n")) return record.markdown;
  const fm = Object.entries(record.metadata)
    .filter(([, v]) => typeof v === "string" || typeof v === "number")
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  return fm ? `---\n${fm}\n---\n\n${record.markdown}` : record.markdown;
}

export async function runConnectorSync(connectorId: string): Promise<void> {
  const db = getDb();
  const connector = await db.query.connectors.findFirst({
    where: eq(schema.connectors.id, connectorId),
  });
  if (!connector) throw new Error(`connector ${connectorId} not found`);
  const impl = PULL_CONNECTORS[connector.type];
  if (!impl) return; // push connectors have nothing to schedule

  const department = await db.query.departments.findFirst({
    where: eq(schema.departments.id, connector.departmentId),
  });
  const instance = await db.query.instances.findFirst({
    where: eq(schema.instances.organizationId, connector.organizationId),
  });
  if (!department?.sourceId || !instance?.agentUrl || !instance.agentTokenEncrypted) {
    throw new Error("department or tenant not ready");
  }
  const agent = new AgentClient(instance.agentUrl, decryptSecret(instance.agentTokenEncrypted));

  const run = await db
    .insert(schema.connectorRuns)
    .values({ connectorId, status: "running" })
    .returning({ id: schema.connectorRuns.id });
  const runId = run[0]!.id;

  try {
    const config = connector.configEncrypted
      ? (JSON.parse(decryptSecret(connector.configEncrypted)) as never)
      : ({} as never);
    const result = await impl.fetch(config, (connector.cursor ?? null) as never);

    let written = 0;
    for (let i = 0; i < result.records.length; i += FILE_BATCH) {
      const batch = result.records.slice(i, i + FILE_BATCH);
      const isLast = i + FILE_BATCH >= result.records.length;
      await agent.putFiles({
        source: department.sourceId,
        files: batch.map((r) => ({ path: r.path, content: withFrontmatter(r) })),
        message: `${connector.type} connector: ${connector.name}`,
        sync: isLast, // one sync at the end of the run
      });
      written += batch.length;
    }
    if (result.records.length === 0) {
      // nothing new — no commit, no sync
    }

    await db
      .update(schema.connectors)
      .set({
        cursor: result.nextCursor,
        lastRunAt: new Date(),
        status: "active",
      })
      .where(eq(schema.connectors.id, connectorId));
    await db
      .update(schema.connectorRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        stats: { ...result.stats, filesWritten: written },
      })
      .where(eq(schema.connectorRuns.id, runId));
    await db
      .update(schema.departments)
      .set({ lastSyncedAt: new Date() })
      .where(eq(schema.departments.id, department.id));
    console.log(`[connector] ${connector.name} (${connector.type}): ${written} files`);
  } catch (e) {
    await db
      .update(schema.connectorRuns)
      .set({ status: "error", finishedAt: new Date(), error: String(e).slice(0, 2000) })
      .where(eq(schema.connectorRuns.id, runId));
    await db
      .update(schema.connectors)
      .set({ status: "error", lastRunAt: new Date() })
      .where(eq(schema.connectors.id, connectorId));
    throw e;
  }
}

/** Interval shorthand: "15m", "1h", "24h". */
function intervalMs(schedule: string): number | null {
  const m = schedule.match(/^(\d+)(m|h)$/);
  if (!m) return null;
  return Number(m[1]) * (m[2] === "h" ? 3_600_000 : 60_000);
}

/** Enqueue syncs for pull connectors whose interval has elapsed. */
export async function scanDueConnectors(
  enqueue: (connectorId: string) => Promise<void>,
): Promise<void> {
  const db = getDb();
  const active = await db.query.connectors.findMany({
    where: and(eq(schema.connectors.status, "active")),
  });
  const now = Date.now();
  for (const c of active) {
    if (!c.schedule || !PULL_CONNECTORS[c.type]) continue;
    const ms = intervalMs(c.schedule);
    if (!ms) continue;
    if (!c.lastRunAt || now - c.lastRunAt.getTime() >= ms) {
      await enqueue(c.id);
    }
  }
}
