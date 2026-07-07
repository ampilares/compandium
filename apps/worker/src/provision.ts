/**
 * provision-instance saga: takes an `instances` row from queued → ready.
 * Idempotent — every step tolerates re-entry after a crash or retry.
 */

import { getDb, schema } from "@compandium/db";
import {
  AgentClient,
  decryptSecret,
  encryptSecret,
  generateToken,
  tenantFlyAppName,
} from "@compandium/shared";
import { eq } from "drizzle-orm";
import { DockerProvisioner } from "./provisioners/docker";
import { FlyProvisioner } from "./provisioners/fly";
import type { TenantProvisioner } from "./provisioners/types";

const HEALTH_TIMEOUT_MS = 5 * 60_000;

function makeProvisioner(kind: string): TenantProvisioner {
  return kind === "docker" ? new DockerProvisioner() : new FlyProvisioner();
}

function bundledAiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.env.BUNDLED_OPENAI_API_KEY) env.OPENAI_API_KEY = process.env.BUNDLED_OPENAI_API_KEY;
  if (process.env.BUNDLED_ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.BUNDLED_ANTHROPIC_API_KEY;
  }
  return env;
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
      lastError = `status ${res.status}`;
    } catch (e) {
      lastError = String(e);
    }
    await Bun.sleep(3000);
  }
  throw new Error(`tenant did not become healthy in time (${lastError})`);
}

export async function provisionInstance(instanceId: string): Promise<void> {
  const db = getDb();
  const instance = await db.query.instances.findFirst({
    where: eq(schema.instances.id, instanceId),
  });
  if (!instance) throw new Error(`instance ${instanceId} not found`);
  if (instance.status === "ready") return;

  const org = await db.query.organization.findFirst({
    where: eq(schema.organization.id, instance.organizationId),
  });
  if (!org) throw new Error(`organization ${instance.organizationId} not found`);

  const update = (values: Partial<typeof schema.instances.$inferInsert>) =>
    db
      .update(schema.instances)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.instances.id, instanceId));

  try {
    await update({ status: "provisioning", lastError: null });

    // Tokens: reuse existing ciphertext on retry so a half-provisioned tenant
    // keeps working credentials.
    const agentToken = instance.agentTokenEncrypted
      ? decryptSecret(instance.agentTokenEncrypted)
      : generateToken(32);
    const bootstrapToken = instance.bootstrapTokenEncrypted
      ? decryptSecret(instance.bootstrapTokenEncrypted)
      : generateToken(32);
    // stable tenant name: reuse a previously chosen fly app name on retry
    const tenantName = instance.flyAppName ?? tenantFlyAppName(org.slug);
    if (!instance.agentTokenEncrypted || !instance.bootstrapTokenEncrypted || !instance.flyAppName) {
      await update({
        agentTokenEncrypted: encryptSecret(agentToken),
        bootstrapTokenEncrypted: encryptSecret(bootstrapToken),
        flyAppName: tenantName,
      });
    }

    const provisioner = makeProvisioner(instance.provider);
    const result = await provisioner.provision({
      tenantName,
      region: instance.region,
      env: {
        AGENT_TOKEN: agentToken,
        GBRAIN_ADMIN_BOOTSTRAP_TOKEN: bootstrapToken,
        ...(instance.aiKeyMode === "bundled" ? bundledAiEnv() : {}),
      },
    });

    await update({
      publicUrl: result.publicUrl,
      agentUrl: result.agentUrl,
      machineId: result.machineId,
      volumeId: result.volumeId,
    });

    await waitForHealth(result.publicUrl, HEALTH_TIMEOUT_MS);

    const agent = new AgentClient(result.agentUrl, agentToken);
    const agentHealth = await agent.health();
    if (!agentHealth.ok) throw new Error("agent unhealthy after provisioning");

    // The image bootstraps a `shared` department; mirror it in the control plane.
    await db
      .insert(schema.departments)
      .values({
        organizationId: instance.organizationId,
        slug: "shared",
        name: "Shared",
        sourceId: "shared",
        status: "ready",
      })
      .onConflictDoNothing();

    await update({ status: "ready", lastHealthyAt: new Date() });
    await db.insert(schema.auditLog).values({
      organizationId: instance.organizationId,
      action: "instance.provisioned",
      target: tenantName,
      meta: { publicUrl: result.publicUrl, provider: instance.provider },
    });
    console.log(`[provision] instance ${instanceId} ready at ${result.publicUrl}`);
  } catch (e) {
    console.error(`[provision] instance ${instanceId} failed:`, e);
    await update({ status: "error", lastError: String(e).slice(0, 2000) });
    throw e;
  }
}
