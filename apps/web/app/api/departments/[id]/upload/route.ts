import { getDb, schema } from "@compandium/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAgentForOrg } from "@/lib/agent";
import { getOrgContext } from "@/lib/org";

export const maxDuration = 300;
const MAX_FILES = 200;
const MAX_FILE_BYTES = 1_000_000;

/** Markdown upload straight into a department (multipart form, field "files"). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const department = await db.query.departments.findFirst({
    where: and(eq(schema.departments.id, id), eq(schema.departments.organizationId, ctx.orgId)),
  });
  if (!department?.sourceId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const agent = await getAgentForOrg(ctx.orgId);
  if (!agent) return NextResponse.json({ error: "brain is not ready" }, { status: 409 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart form expected" }, { status: 400 });
  const entries = form.getAll("files").filter((f): f is File => f instanceof File);
  if (entries.length === 0) return NextResponse.json({ error: "no files" }, { status: 400 });
  if (entries.length > MAX_FILES) {
    return NextResponse.json({ error: `too many files (max ${MAX_FILES})` }, { status: 400 });
  }

  const files: Array<{ path: string; content: string }> = [];
  for (const file of entries) {
    if (!/\.(md|markdown|txt)$/i.test(file.name)) {
      return NextResponse.json({ error: `unsupported file type: ${file.name}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `file too large: ${file.name}` }, { status: 400 });
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/\.txt$/i, ".md");
    files.push({ path: `uploads/${safeName}`, content: await file.text() });
  }

  try {
    await agent.putFiles({
      source: department.sourceId,
      files,
      message: `upload by ${ctx.userId}: ${files.length} file(s)`,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 500) }, { status: 502 });
  }

  await db
    .update(schema.departments)
    .set({ lastSyncedAt: new Date() })
    .where(eq(schema.departments.id, id));
  await db.insert(schema.auditLog).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    action: "department.upload",
    target: department.slug,
    meta: { files: files.length },
  });
  return NextResponse.json({ ok: true, files: files.length });
}
