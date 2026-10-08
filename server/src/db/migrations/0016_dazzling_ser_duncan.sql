CREATE TABLE "eval_run_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"system_prompt" text NOT NULL,
	"model" text NOT NULL,
	"recall" double precision NOT NULL,
	"precision" double precision NOT NULL,
	"citation_accuracy" double precision NOT NULL,
	"cases_total" integer NOT NULL,
	"cases_passed" integer NOT NULL,
	"duration_ms" integer,
	"cost_usd" double precision
);
--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_run_groups" ADD CONSTRAINT "eval_run_groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_group_id_eval_run_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."eval_run_groups"("id") ON DELETE cascade ON UPDATE no action;