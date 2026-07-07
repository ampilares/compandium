/**
 * Minimal MCP-over-HTTP client for tenant brains: OAuth client_credentials
 * token + JSON-RPC tools/call against <publicUrl>/mcp (SSE-framed responses).
 */

export interface McpCredentials {
  publicUrl: string;
  clientId: string;
  clientSecret: string;
}

export async function getAccessToken(creds: McpCredentials): Promise<string> {
  const res = await fetch(`${creds.publicUrl}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("token exchange returned no access_token");
  return data.access_token;
}

function parseSseJson(text: string): unknown {
  // responses are SSE-framed: take the last `data:` line
  const lines = text.split("\n").filter((l) => l.startsWith("data:"));
  const last = lines[lines.length - 1];
  if (!last) throw new Error("no data frame in MCP response");
  return JSON.parse(last.slice(5).trim());
}

export async function mcpToolCall(
  creds: McpCredentials,
  tool: string,
  args: Record<string, unknown>,
  timeoutMs = 120_000,
): Promise<string> {
  const token = await getAccessToken(creds);
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };

  const init = await fetch(`${creds.publicUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "compandium-web", version: "0.1" },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!init.ok) throw new Error(`MCP initialize failed (${init.status})`);

  const res = await fetch(`${creds.publicUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`MCP tools/call failed (${res.status})`);

  const payload = parseSseJson(await res.text()) as {
    result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
    error?: { message?: string };
  };
  if (payload.error) throw new Error(payload.error.message ?? "MCP error");
  const text = payload.result?.content
    ?.filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");
  if (payload.result?.isError) throw new Error(text || "tool call failed");
  return text ?? "";
}
