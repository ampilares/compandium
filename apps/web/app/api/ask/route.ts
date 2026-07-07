import { decryptSecret } from "@compandium/shared";
import { NextResponse } from "next/server";
import { mcpToolCall } from "@/lib/mcp";
import { getInstance, getMemberCredentials, getOrgContext } from "@/lib/org";

export const maxDuration = 120;

/** Ask the brain as the signed-in member (their credentials, their scope). */
export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { question?: string; mode?: string };
  const question = body.question?.trim();
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });
  if (question.length > 2000) {
    return NextResponse.json({ error: "question too long" }, { status: 400 });
  }

  const instance = await getInstance(ctx.orgId);
  if (!instance?.publicUrl || instance.status !== "ready") {
    return NextResponse.json({ error: "brain is not ready" }, { status: 409 });
  }
  const credentials = await getMemberCredentials(ctx.orgId, ctx.memberId);
  if (!credentials?.secretEncrypted || !credentials.gbrainClientId) {
    return NextResponse.json(
      { error: "no brain access yet — ask an admin to grant you department access" },
      { status: 403 },
    );
  }

  const creds = {
    publicUrl: instance.publicUrl,
    clientId: credentials.gbrainClientId,
    clientSecret: decryptSecret(credentials.secretEncrypted),
  };
  const tool = body.mode === "search" ? "search" : "think";
  const args = tool === "think" ? { question } : { query: question };

  try {
    const answer = await mcpToolCall(creds, tool, args);
    return NextResponse.json({ answer, tool });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
