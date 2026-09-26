CREATE TABLE "pr_history_cache" (
	"repo_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pr_history_cache_repo_id_file_path_pk" PRIMARY KEY("repo_id","file_path")
);
--> statement-breakpoint
ALTER TABLE "pr_history_cache" ADD CONSTRAINT "pr_history_cache_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;