import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { member, organization, user } from "./auth";

// One hosted gbrain instance per organization (Fly app + machine + volume).
export const instances = pgTable("instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["queued", "provisioning", "ready", "error", "suspended"],
  })
    .notNull()
    .default("queued"),
  // which backend runs the tenant: fly (prod) or docker (local dev)
  provider: text("provider", { enum: ["fly", "docker"] }).notNull().default("fly"),
  // private URL of the compandium-agent sidecar (Fly private net / localhost)
  agentUrl: text("agent_url"),
  flyAppName: text("fly_app_name").unique(),
  region: text("region").notNull().default("iad"),
  machineId: text("machine_id"),
  volumeId: text("volume_id"),
  publicUrl: text("public_url"),
  gbrainVersion: text("gbrain_version"),
  // shared secret for the compandium-agent sidecar, AES-GCM encrypted at rest
  agentTokenEncrypted: text("agent_token_encrypted"),
  // gbrain admin bootstrap token, AES-GCM encrypted at rest
  bootstrapTokenEncrypted: text("bootstrap_token_encrypted"),
  aiKeyMode: text("ai_key_mode", { enum: ["bundled", "byo"] })
    .notNull()
    .default("bundled"),
  byoKeysEncrypted: text("byo_keys_encrypted"),
  lastHealthyAt: timestamp("last_healthy_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Department = one gbrain source (its own git repo on the tenant volume).
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    // gbrain source id inside the tenant instance
    sourceId: text("source_id"),
    status: text("status", { enum: ["creating", "ready", "error"] })
      .notNull()
      .default("creating"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    pageCount: integer("page_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("departments_org_slug_idx").on(t.organizationId, t.slug)],
);

// One gbrain OAuth client per org member, carrying department scoping.
export const memberCredentials = pgTable("member_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  memberId: text("member_id")
    .notNull()
    .unique()
    .references(() => member.id, { onDelete: "cascade" }),
  gbrainClientId: text("gbrain_client_id"),
  // client_secret, AES-GCM encrypted; needed so the Ask UI can query as this member
  secretEncrypted: text("secret_encrypted"),
  writeDepartmentId: uuid("write_department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  readDepartmentIds: jsonb("read_department_ids").$type<string[]>().notNull().default([]),
  status: text("status", { enum: ["provisioning", "active", "revoked", "error"] })
    .notNull()
    .default("provisioning"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const connectors = pgTable("connectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["git", "upload", "webhook", "notion", "slack", "gdrive"],
  }).notNull(),
  name: text("name").notNull(),
  configEncrypted: text("config_encrypted"),
  // cron expression for scheduled sync; null = manual/webhook-driven
  schedule: text("schedule"),
  cursor: jsonb("cursor").$type<Record<string, unknown>>(),
  status: text("status", { enum: ["active", "paused", "error"] })
    .notNull()
    .default("active"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const connectorRuns = pgTable("connector_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectorId: uuid("connector_id")
    .notNull()
    .references(() => connectors.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["running", "success", "error"] })
    .notNull()
    .default("running"),
  stats: jsonb("stats").$type<Record<string, unknown>>(),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    metric: text("metric").notNull(),
    amount: numeric("amount").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
  },
  (t) => [uniqueIndex("usage_org_day_metric_idx").on(t.organizationId, t.day, t.metric)],
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: text("plan", { enum: ["free", "team", "scale"] }).notNull().default("free"),
  seats: integer("seats").notNull().default(1),
  status: text("status").notNull().default("active"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  target: text("target"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
