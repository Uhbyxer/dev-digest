ALTER TABLE "ci_installations" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_version" text DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "ci_installation_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "ci_pr_number" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "ci_repo" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "ci_job_url" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "ci_github_run_id" bigint;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_ci_installation_id_ci_installations_id_fk" FOREIGN KEY ("ci_installation_id") REFERENCES "public"."ci_installations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_ci_identity_uq" ON "agent_runs" USING btree ("ci_installation_id","ci_github_run_id","ci_pr_number") WHERE "agent_runs"."source" = 'ci';--> statement-breakpoint
DELETE FROM "ci_installations" a USING "ci_installations" b WHERE a."agent_id" = b."agent_id" AND a."repo" = b."repo" AND a."target_type" = b."target_type" AND (a."installed_at" > b."installed_at" OR (a."installed_at" = b."installed_at" AND a."id" > b."id"));--> statement-breakpoint
ALTER TABLE "ci_installations" ADD CONSTRAINT "ci_installations_agent_repo_target_uq" UNIQUE("agent_id","repo","target_type");