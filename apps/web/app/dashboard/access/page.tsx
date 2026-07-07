"use client";

import { useEffect, useState } from "react";

interface AccessInfo {
  ready: boolean;
  provisioned?: boolean;
  publicUrl?: string;
  mcpUrl?: string;
  clientId?: string;
  clientSecret?: string;
  writeDepartment?: string | null;
  readDepartments?: string[];
}

function Snippet({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <button
          className="text-xs text-zinc-500 underline"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-100">{code}</pre>
    </section>
  );
}

export default function AccessPage() {
  const [info, setInfo] = useState<AccessInfo | null>(null);

  useEffect(() => {
    void fetch("/api/me/access")
      .then((r) => r.json())
      .then(setInfo);
  }, []);

  if (!info) return <main className="mx-auto max-w-3xl">Loading…</main>;
  if (!info.ready) {
    return (
      <main className="mx-auto max-w-3xl text-zinc-500">
        The brain isn&apos;t provisioned yet — check the Overview page.
      </main>
    );
  }
  if (!info.provisioned) {
    return (
      <main className="mx-auto max-w-3xl text-zinc-500">
        You don&apos;t have brain credentials yet. Ask a workspace admin to grant you department
        access on the Members page.
      </main>
    );
  }

  const env = `GBRAIN_REMOTE_CLIENT_ID=${info.clientId}\nGBRAIN_REMOTE_CLIENT_SECRET=${info.clientSecret}\nGBRAIN_REMOTE_MCP_URL=${info.mcpUrl}`;
  const claudeDesktop = JSON.stringify(
    {
      mcpServers: {
        "company-brain": {
          command: "gbrain",
          args: ["serve"],
        },
      },
    },
    null,
    2,
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Agent access</h1>
        <p className="text-sm text-zinc-500">
          Connect your AI agents to the company brain with your personal credentials. Your agents
          see exactly what you see: write <code>{info.writeDepartment}</code>, read{" "}
          {info.readDepartments?.join(", ")}.
        </p>
      </div>

      <Snippet
        title="Your credentials (keep these private)"
        code={`MCP endpoint:  ${info.mcpUrl}\nClient ID:     ${info.clientId}\nClient secret: ${info.clientSecret}`}
      />

      <Snippet
        title="Claude Code / Codex (thin client via gbrain CLI)"
        code={`bun install -g github:garrytan/gbrain\ngbrain connect ${info.mcpUrl} \\\n  --oauth-client-id ${info.clientId} \\\n  --oauth-client-secret ${info.clientSecret} \\\n  --install`}
      />

      <Snippet title="Environment variables (any gbrain thin client)" code={env} />

      <Snippet
        title="Claude Desktop (claude_desktop_config.json, after gbrain init --mcp-only)"
        code={claudeDesktop}
      />
    </main>
  );
}
