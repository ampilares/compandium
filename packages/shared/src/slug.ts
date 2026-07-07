const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "www",
  "compandium",
  "shared",
  "default",
  "host",
]);

const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** Fly app names are global; namespace tenant apps and add entropy. */
export function tenantFlyAppName(orgSlug: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `cpd-${orgSlug.slice(0, 24)}-${suffix}`;
}
