import PgBoss from "pg-boss";

let boss: PgBoss | undefined;
let starting: Promise<PgBoss> | undefined;

/**
 * Send-side pg-boss client for API routes. The worker owns queue creation,
 * scheduling, and maintenance — this instance must never compete for them,
 * hence supervise/schedule off.
 */
export async function getQueue(): Promise<PgBoss> {
  if (boss) return boss;
  starting ??= (async () => {
    const b = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
      schema: "pgboss",
      supervise: false,
      schedule: false,
    });
    b.on("error", (err) => console.error("[pg-boss/web]", err));
    await b.start();
    boss = b;
    return b;
  })();
  return starting;
}
