/**
 * Production provisioner: one Fly app per tenant (app name = tenantName),
 * one volume, one machine running the tenant image. The agent is reached
 * over Fly private networking (requires the worker to run inside the same
 * Fly organization): http://<app>.internal:8081
 */

import { FlyApiError, FlyClient } from "@compandium/shared";
import type { ProvisionRequest, ProvisionResult, TenantProvisioner } from "./types";

export class FlyProvisioner implements TenantProvisioner {
  readonly kind = "fly" as const;
  private readonly fly: FlyClient;
  private readonly image: string;

  constructor() {
    const apiToken = process.env.FLY_API_TOKEN;
    const orgSlug = process.env.FLY_ORG_SLUG;
    const image = process.env.TENANT_IMAGE;
    if (!apiToken || !orgSlug) throw new Error("FLY_API_TOKEN and FLY_ORG_SLUG are required");
    if (!image) throw new Error("TENANT_IMAGE (pullable image ref) is required for Fly");
    this.fly = new FlyClient({ apiToken, orgSlug });
    this.image = image;
  }

  async provision(req: ProvisionRequest): Promise<ProvisionResult> {
    const appName = req.tenantName;
    const publicUrl = `https://${appName}.fly.dev`;

    if (!(await this.fly.appExists(appName))) {
      await this.fly.createApp(appName);
    }
    await this.fly.allocateIps(appName).catch((e) => {
      // already-allocated errors are fine on retry
      if (!(e instanceof FlyApiError) || !/already/i.test(e.message)) throw e;
    });

    const volume = await this.fly.createVolume(appName, req.region);
    const machine = await this.fly.createMachine({
      appName,
      region: req.region,
      image: this.image,
      env: { ...req.env, PUBLIC_URL: publicUrl },
      volumeId: volume.id,
    });

    return {
      publicUrl,
      agentUrl: `http://${appName}.internal:8081`,
      machineId: machine.id,
      volumeId: volume.id,
      flyAppName: appName,
    };
  }

  async destroy(tenantName: string): Promise<void> {
    await this.fly.deleteApp(tenantName);
  }
}
