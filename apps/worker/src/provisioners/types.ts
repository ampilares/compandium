export interface ProvisionRequest {
  /** stable tenant identifier used to name apps/containers/volumes */
  tenantName: string;
  region: string;
  /** full env for the tenant container (tokens, PUBLIC_URL placeholder resolved by provider) */
  env: Record<string, string>;
}

export interface ProvisionResult {
  publicUrl: string;
  agentUrl: string;
  machineId?: string;
  volumeId?: string;
  flyAppName?: string;
}

export interface TenantProvisioner {
  readonly kind: "fly" | "docker";
  /** Idempotent: safe to call again after a partial failure. */
  provision(req: ProvisionRequest): Promise<ProvisionResult>;
  destroy(tenantName: string): Promise<void>;
}
