import { getDb, schema } from "@compandium/db";
import { NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SOURCES = new Set(["hero", "footer-cta", "pricing"]);

/** Public lead capture from the marketing site. Idempotent per email. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; source?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }
  const source = SOURCES.has(body.source ?? "") ? body.source! : "hero";

  const db = getDb();
  await db.insert(schema.leads).values({ email, source }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
