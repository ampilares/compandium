/**
 * Minimal Fly.io client for tenant provisioning: Machines REST API
 * (api.machines.dev) for apps/volumes/machines, GraphQL for IP allocation.
 */

const MACHINES_API = "https://api.machines.dev/v1";
const GRAPHQL_API = "https://api.fly.io/graphql";

export interface FlyClientOptions {
  apiToken: string;
  orgSlug: string;
}

export interface CreateMachineOptions {
  appName: string;
  region: string;
  image: string;
  env: Record<string, string>;
  volumeId: string;
  memoryMb?: number;
  cpus?: number;
}

export class FlyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`${message} (${status}): ${body.slice(0, 500)}`);
  }
}

export class FlyClient {
  constructor(private readonly opts: FlyClientOptions) {}

  private async rest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${MACHINES_API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.opts.apiToken}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new FlyApiError(`fly ${method} ${path}`, res.status, text);
    return (text ? JSON.parse(text) : {}) as T;
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(GRAPHQL_API, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.opts.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    const text = await res.text();
    if (!res.ok) throw new FlyApiError("fly graphql", res.status, text);
    const parsed = JSON.parse(text) as { data?: T; errors?: Array<{ message: string }> };
    if (parsed.errors?.length) {
      throw new FlyApiError("fly graphql", 200, parsed.errors.map((e) => e.message).join("; "));
    }
    return parsed.data as T;
  }

  async createApp(appName: string): Promise<void> {
    await this.rest("POST", "/apps", {
      app_name: appName,
      org_slug: this.opts.orgSlug,
    });
  }

  async deleteApp(appName: string): Promise<void> {
    await this.rest("DELETE", `/apps/${appName}`);
  }

  async appExists(appName: string): Promise<boolean> {
    try {
      await this.rest("GET", `/apps/${appName}`);
      return true;
    } catch (e) {
      if (e instanceof FlyApiError && e.status === 404) return false;
      throw e;
    }
  }

  async listVolumes(appName: string): Promise<Array<{ id: string; name: string; region: string }>> {
    return this.rest("GET", `/apps/${appName}/volumes`);
  }

  /** Idempotent: a provisioning retry reuses the existing data volume. */
  async ensureVolume(appName: string, region: string, sizeGb = 10): Promise<{ id: string }> {
    const existing = (await this.listVolumes(appName)).find(
      (v) => v.name === "data" && v.region === region,
    );
    if (existing) return existing;
    return this.rest("POST", `/apps/${appName}/volumes`, {
      name: "data",
      region,
      size_gb: sizeGb,
    });
  }

  async createMachine(options: CreateMachineOptions): Promise<{ id: string; state: string }> {
    return this.rest("POST", `/apps/${options.appName}/machines`, {
      region: options.region,
      config: {
        image: options.image,
        env: options.env,
        guest: {
          cpu_kind: "shared",
          cpus: options.cpus ?? 1,
          memory_mb: options.memoryMb ?? 2048,
        },
        mounts: [{ volume: options.volumeId, path: "/data" }],
        services: [
          {
            internal_port: 8080,
            protocol: "tcp",
            ports: [
              { port: 443, handlers: ["tls", "http"] },
              { port: 80, handlers: ["http"], force_https: true },
            ],
            checks: [
              {
                type: "http",
                port: 8080,
                method: "GET",
                path: "/health",
                interval: "30s",
                timeout: "5s",
                grace_period: "60s",
              },
            ],
          },
        ],
        restart: { policy: "always" },
      },
    });
  }

  async getMachine(appName: string, machineId: string): Promise<{ id: string; state: string }> {
    return this.rest("GET", `/apps/${appName}/machines/${machineId}`);
  }

  async listMachines(appName: string): Promise<Array<{ id: string; state: string }>> {
    return this.rest("GET", `/apps/${appName}/machines`);
  }

  /** Allocate shared IPv4 + dedicated IPv6 so <app>.fly.dev routes publicly. */
  async allocateIps(appName: string): Promise<void> {
    const mutation = `
      mutation($input: AllocateIPAddressInput!) {
        allocateIpAddress(input: $input) { ipAddress { address type } }
      }`;
    await this.graphql(mutation, { input: { appId: appName, type: "shared_v4" } });
    await this.graphql(mutation, { input: { appId: appName, type: "v6" } });
  }
}
