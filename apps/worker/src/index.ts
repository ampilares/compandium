import PgBoss from "pg-boss";
import { QUEUES } from "./queues";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const boss = new PgBoss({ connectionString, schema: "pgboss" });

boss.on("error", (err) => console.error("[pg-boss]", err));

await boss.start();

for (const queue of Object.values(QUEUES)) {
  await boss.createQueue(queue);
}

// Handlers are stubs in Phase 0; each later phase fills one in.
await boss.work(QUEUES.provisionInstance, async ([job]) => {
  console.log("provision-instance received", job?.data);
  throw new Error("provisioning not implemented yet (Phase 1)");
});

await boss.work(QUEUES.connectorSync, async ([job]) => {
  console.log("connector-sync received", job?.data);
  throw new Error("connectors not implemented yet (Phase 4)");
});

await boss.work(QUEUES.healthPoll, async () => {
  console.log("health-poll tick");
});

await boss.work(QUEUES.meterUsage, async () => {
  console.log("meter-usage tick");
});

// Every 5 minutes, poll tenant health (no-op until Phase 3).
await boss.schedule(QUEUES.healthPoll, "*/5 * * * *", undefined, {});
// Daily usage metering at 02:10 UTC (no-op until Phase 5).
await boss.schedule(QUEUES.meterUsage, "10 2 * * *", undefined, {});

console.log("compandium worker started; queues:", Object.values(QUEUES).join(", "));
