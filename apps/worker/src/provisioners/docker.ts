/**
 * Local-dev provisioner: one Docker container + named volume per tenant on
 * the developer's machine. Ports are published randomly (-P) and read back
 * from docker inspect. Requires the tenant image to be built locally:
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

async function hostPort(container: string, containerPort: number): Promise<string> {
  const r = await docker(["port", container, String(containerPort)]);
  if (r.code !== 0) throw new Error(`docker port failed: ${r.stderr}`);
  // output like "0.0.0.0:55001" (possibly multiple lines for v4/v6)
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
    if (existing.code !== 0) {
      // PUBLIC_URL needs the mapped port, which we only know after start.
      // Start with a placeholder, read the port, then recreate with the real
      // URL is wasteful — instead run once with -P and pass the URL after
      // discovery via a restart with the same volume (state persists).
      const envArgs = Object.entries({ ...req.env, PUBLIC_URL: "http://localhost:0" }).flatMap(
        ([k, v]) => ["-e", `${k}=${v}`],
      );
      const run = await docker([
        "run",
        "-d",
        "--name",
        name,
        "-v",
        `${name}-data:/data`,
        "-P",
        ...envArgs,
        IMAGE,
      ]);
      if (run.code !== 0) throw new Error(`docker run failed: ${run.stderr}`);
    } else if (existing.stdout !== "true") {
      const start = await docker(["start", name]);
      if (start.code !== 0) throw new Error(`docker start failed: ${start.stderr}`);
    }

    const servePort = await hostPort(name, 8080);
    const agentPort = await hostPort(name, 8081);
    const publicUrl = `http://localhost:${servePort}`;

    // Recreate the container once with the real PUBLIC_URL if it still holds
    // the placeholder (volume keeps all state; ports change, so re-read them).
    const envNow = await docker(["inspect", "--format", "{{json .Config.Env}}", name]);
    if (envNow.stdout.includes("PUBLIC_URL=http://localhost:0")) {
      await docker(["rm", "-f", name]);
      const envArgs = Object.entries({ ...req.env, PUBLIC_URL: publicUrl }).flatMap(([k, v]) => [
        "-e",
        `${k}=${v}`,
      ]);
      // pin the discovered ports so PUBLIC_URL stays correct across restarts
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
      if (run.code !== 0) throw new Error(`docker recreate failed: ${run.stderr}`);
    }

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
