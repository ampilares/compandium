/**
 * Local-dev provisioner: one Docker container + named volume per tenant on
 * the developer's machine. Host ports are picked up front (bind-probe on
 * port 0) so the container starts exactly once with its final PUBLIC_URL.
 * Requires the tenant image to be built locally:
 *   cd packages/tenant-image && docker build -t compandium-tenant .
 */

import type { ProvisionRequest, ProvisionResult, TenantProvisioner } from "./types";

const IMAGE = process.env.TENANT_IMAGE ?? "compandium-tenant";

async function docker(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout: stdout.trim(), stderr: stderr.trim() };
}

function containerName(tenantName: string): string {
  // tenant names from tenantFlyAppName() already carry the cpd- prefix
  return tenantName.startsWith("cpd-") ? tenantName : `cpd-${tenantName}`;
}

/** Ask the OS for a free port by binding port 0 and reading the assignment. */
function freePort(): number {
  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const port = server.port;
  server.stop(true);
  return port;
}

async function hostPort(container: string, containerPort: number): Promise<string> {
  const r = await docker(["port", container, String(containerPort)]);
  if (r.code !== 0) throw new Error(`docker port failed: ${r.stderr}`);
  const first = r.stdout.split("\n")[0] ?? "";
  const port = first.split(":").pop();
  if (!port) throw new Error(`could not parse docker port output: ${r.stdout}`);
  return port;
}

export class DockerProvisioner implements TenantProvisioner {
  readonly kind = "docker" as const;

  async provision(req: ProvisionRequest): Promise<ProvisionResult> {
    const name = containerName(req.tenantName);

    const existing = await docker(["inspect", "--format", "{{.State.Running}}", name]);
    if (existing.code === 0) {
      // container already exists (retry): start it if stopped, reuse its ports
      if (existing.stdout !== "true") {
        const start = await docker(["start", name]);
        if (start.code !== 0) throw new Error(`docker start failed: ${start.stderr}`);
      }
      const servePort = await hostPort(name, 8080);
      const agentPort = await hostPort(name, 8081);
      return {
        publicUrl: `http://localhost:${servePort}`,
        agentUrl: `http://localhost:${agentPort}`,
        machineId: name,
      };
    }

    const servePort = freePort();
    const agentPort = freePort();
    const publicUrl = `http://localhost:${servePort}`;
    const envArgs = Object.entries({ ...req.env, PUBLIC_URL: publicUrl }).flatMap(([k, v]) => [
      "-e",
      `${k}=${v}`,
    ]);
    const run = await docker([
      "run",
      "-d",
      "--name",
      name,
      "-v",
      `${name}-data:/data`,
      "-p",
      `${servePort}:8080`,
      "-p",
      `${agentPort}:8081`,
      ...envArgs,
      IMAGE,
    ]);
    if (run.code !== 0) throw new Error(`docker run failed: ${run.stderr}`);

    return {
      publicUrl,
      agentUrl: `http://localhost:${agentPort}`,
      machineId: name,
    };
  }

  async destroy(tenantName: string): Promise<void> {
    const name = containerName(tenantName);
    await docker(["rm", "-f", name]);
    await docker(["volume", "rm", "-f", `${name}-data`]);
  }
}
