import { AgentClient, decryptSecret } from "@compandium/shared";
import { getInstance } from "./org";

/** Agent client for an org's tenant instance; null until the brain is ready. */
export async function getAgentForOrg(orgId: string): Promise<AgentClient | null> {
  const instance = await getInstance(orgId);
  if (!instance || instance.status !== "ready" || !instance.agentUrl) return null;
  if (!instance.agentTokenEncrypted) return null;
  return new AgentClient(instance.agentUrl, decryptSecret(instance.agentTokenEncrypted));
}
