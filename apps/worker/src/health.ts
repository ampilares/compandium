import { getDb, schema } from "@compandium/db";
import { AgentClient, decryptSecret } from "@compandium/shared";
import { eq } from "drizzle-orm";

/** Poll every ready tenant's agent; record lastHealthyAt / lastError. */
export async function pollTenantHealth(): Promise<void> {
  const db = getDb();
  const ready = await db.query.instances.findMany({
    where: eq(schema.instances.status, "ready"),
  });

  for (const instance of ready) {
    if (!instance.agentUrl || !instance.agentTokenEncrypted) continue;
    const agent = new AgentClient(instance.agentUrl, decryptSecret(instance.agentTokenEncrypted));
    try {
      const health = await agent.health(20_000);
      if (health.ok) {
        await db
          .update(schema.instances)
          .set({ lastHealthyAt: new Date(), lastError: null, updatedAt: new Date() })
          .where(eq(schema.instances.id, instance.id));
      } else {
        await db
          .update(schema.instances)
          .set({ lastError: "agent reports unhealthy", updatedAt: new Date() })
          .where(eq(schema.instances.id, instance.id));
      }
    } catch (e) {
      await db
        .update(schema.instances)
        .set({ lastError: `health poll failed: ${String(e).slice(0, 500)}`, updatedAt: new Date() })
        .where(eq(schema.instances.id, instance.id));
    }
  }
}
