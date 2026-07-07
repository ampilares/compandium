import { getDb, schema } from "@compandium/db";
import { decryptSecret } from "@compandium/shared";
import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getInstance, getMemberCredentials, getOrgContext } from "@/lib/org";

/** The signed-in member's own brain credentials + MCP setup material. */
export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const instance = await getInstance(ctx.orgId);
  if (!instance || instance.status !== "ready") {
    return NextResponse.json({ ready: false });
  }

  const credentials = await getMemberCredentials(ctx.orgId, ctx.memberId);
  if (!credentials || credentials.status !== "active" || !credentials.secretEncrypted) {
    return NextResponse.json({ ready: true, provisioned: false });
  }

  const db = getDb();
  const readDepts = credentials.readDepartmentIds.length
    ? await db.query.departments.findMany({
        where: inArray(schema.departments.id, credentials.readDepartmentIds),
      })
    : [];

  return NextResponse.json({
    ready: true,
    provisioned: true,
    publicUrl: instance.publicUrl,
    mcpUrl: `${instance.publicUrl}/mcp`,
    clientId: credentials.gbrainClientId,
    clientSecret: decryptSecret(credentials.secretEncrypted),
    writeDepartment: readDepts.find((d) => d.id === credentials.writeDepartmentId)?.slug ?? null,
    readDepartments: readDepts.map((d) => d.slug),
  });
}
