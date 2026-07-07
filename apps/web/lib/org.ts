import { getDb, schema } from "@compandium/db";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "./auth";

export interface OrgContext {
  userId: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
  memberId: string;
  role: string;
}

/** Session + single-org membership context for API routes; null = unauthorized. */
export async function getOrgContext(): Promise<OrgContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const db = getDb();
  const membership = await db
    .select({
      memberId: schema.member.id,
      role: schema.member.role,
      orgId: schema.organization.id,
      orgSlug: schema.organization.slug,
      orgName: schema.organization.name,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
    .where(eq(schema.member.userId, session.user.id))
    .limit(1);
  const m = membership[0];
  if (!m) return null;
  return { userId: session.user.id, ...m };
}

export function isAdmin(ctx: OrgContext): boolean {
  return ctx.role === "owner" || ctx.role === "admin";
}

export async function getInstance(orgId: string) {
  const db = getDb();
  return db.query.instances.findFirst({
    where: eq(schema.instances.organizationId, orgId),
  });
}

export async function getDepartments(orgId: string) {
  const db = getDb();
  return db.query.departments.findMany({
    where: eq(schema.departments.organizationId, orgId),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });
}

export async function getMemberCredentials(orgId: string, memberId: string) {
  const db = getDb();
  return db.query.memberCredentials.findFirst({
    where: and(
      eq(schema.memberCredentials.organizationId, orgId),
      eq(schema.memberCredentials.memberId, memberId),
    ),
  });
}
