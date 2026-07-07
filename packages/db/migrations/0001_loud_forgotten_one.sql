ALTER TABLE "instances" ADD COLUMN "provider" text DEFAULT 'fly' NOT NULL;--> statement-breakpoint
ALTER TABLE "instances" ADD COLUMN "agent_url" text;