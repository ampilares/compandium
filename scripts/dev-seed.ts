import { getDb } from "../packages/db/src/index";
import { AgentClient, decryptSecret } from "../packages/shared/src/index";

const db = getDb();
const instance = await db.query.instances.findFirst();
if (!instance?.agentUrl || !instance.agentTokenEncrypted) throw new Error("no ready instance");
const agent = new AgentClient(instance.agentUrl, decryptSecret(instance.agentTokenEncrypted));

const result = await agent.putFiles({
  source: "engineering",
  message: "seed: payment runbook + decision",
  files: [
    {
      path: "runbooks/payment-rate-limit.md",
      content:
        "# Payment rate limit runbook\n\nThe payment gateway rate limit is 1000 rps, raised from 500 rps after the June 2026 outage. If 503s appear on /payments, check the gateway dashboard first. Decision owner: Dana (platform team).\n",
    },
    {
      path: "decisions/d-007-rate-limit.md",
      content:
        "# Decision d-007: raise payment gateway rate limit\n\nDate: 2026-06-14. We raised the payment gateway limit from 500 to 1000 rps after the outage post-mortem showed sustained 700 rps peaks. Approved by Dana and the platform team. Revisit when sustained traffic passes 800 rps.\n",
    },
  ],
});
console.log(JSON.stringify(result));
process.exit(0);
