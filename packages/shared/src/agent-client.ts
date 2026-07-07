/**
 * Typed client for the compandium-agent sidecar running inside each tenant
 * (packages/tenant-image/agent/server.ts). Used by the worker and the web app
 * over Fly private networking (or localhost in dev).
 */

export interface AgentMemberCredentials {
  clientId: string;
  clientSecret: string;
}

export class AgentError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export class AgentClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 120_000,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 500);
      try {
        const parsed = JSON.parse(text) as { error?: string; detail?: string };
        detail = parsed.detail ?? parsed.error ?? detail;
      } catch {
        // keep raw text
      }
      throw new AgentError(`agent ${method} ${path}: ${detail}`, res.status);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  createDepartment(slug: string, name: string): Promise<{ ok: boolean; sourceId: string }> {
    return this.request("POST", "/v1/departments", { slug, name });
  }

  removeDepartment(slug: string): Promise<{ ok: boolean }> {
    return this.request("DELETE", `/v1/departments/${slug}`);
  }

  listDepartments(): Promise<{ sources: unknown[] }> {
    return this.request("GET", "/v1/departments");
  }

  sync(source?: string): Promise<{ ok: boolean }> {
    return this.request("POST", "/v1/sync", source ? { source } : {}, 600_000);
  }

  putFiles(input: {
    source: string;
    files: Array<{ path: string; content: string | null }>;
    message?: string;
    sync?: boolean;
  }): Promise<{ ok: boolean; committed: boolean; files: number }> {
    return this.request("POST", "/v1/files", input, 600_000);
  }

  registerMember(input: {
    name: string;
    source: string;
    federatedRead: string[];
  }): Promise<{ ok: boolean } & AgentMemberCredentials> {
    return this.request("POST", "/v1/members", input);
  }

  revokeMember(clientId: string): Promise<{ ok: boolean }> {
    return this.request("DELETE", `/v1/members/${encodeURIComponent(clientId)}`);
  }

  health(timeoutMs = 30_000): Promise<{ ok: boolean; checks: Record<string, unknown> }> {
    return this.request("GET", "/v1/health", undefined, timeoutMs);
  }
}
