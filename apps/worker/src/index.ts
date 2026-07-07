import PgBoss from "pg-boss";
import { provisionInstance } from "./provision";
import type { ProvisionInstancePayload } from "./queues";
import { QUEUES } from "./queues";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const boss = new PgBoss({ connectionString, schema: "pgboss" });

boss.on("error", (err) => console.error("[pg-boss]", err));

await boss.start();

for (const queue of [...Object.values(QUEUES), "connector-scan"]) {
  await boss.createQueue(queue);
}

await boss.work(QUEUES.provisionInstance, async ([job]) => {
  const payload = job?.data as ProvisionInstancePayload | undefined;
  if (!payload?.instanceId) throw new Error("provision-instance: missing instanceId");
  await provisionInstance(payload.instanceId);
});

await boss.work(QUEUES.connectorSync, async ([job]) => {
  const payload = job?.data as { connectorId?: string } | undefined;
  if (!payload?.connectorId) throw new Error("connector-sync: missing connectorId");
  const { runConnectorSync } = await import("./connector-sync");
  await runConnectorSync(payload.connectorId);
});

await boss.work("connector-scan", async () => {
  const { scanDueConnectors } = await import("./connector-sync");
  await scanDueConnectors(async (connectorId) => {
    await boss.send(QUEUES.connectorSync, { connectorId }, { singletonKey: connectorId });
  });
});

await boss.work(QUEUES.healthPoll, async () => {
  const { pollTenantHealth } = await import("./health");
  await pollTenantHealth();
});

await boss.work(QUEUES.meterUsage, async () => {
  console.log("meter-usage tick");
});

// Every 5 minutes, poll tenant health.
await boss.schedule(QUEUES.healthPoll, "*/5 * * * *", undefined, {});
// Every 10 minutes, enqueue due connector syncs.
await boss.schedule("connector-scan", "*/10 * * * *", undefined, {});
// Daily usage metering at 02:10 UTC (no-op until Phase 5).
await boss.schedule(QUEUES.meterUsage, "10 2 * * *", undefined, {});

console.log("compandium worker started; queues:", Object.values(QUEUES).join(", "));
