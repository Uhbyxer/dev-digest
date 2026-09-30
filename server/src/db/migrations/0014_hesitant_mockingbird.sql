CREATE TABLE "context_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"path" text NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "context_attachments" ADD CONSTRAINT "context_attachments_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "context_attachments_owner_path_uq" ON "context_attachments" USING btree ("repo_id","owner_type","owner_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "context_attachments_owner_order_uq" ON "context_attachments" USING btree ("repo_id","owner_type","owner_id","order");--> statement-breakpoint
CREATE INDEX "context_attachments_repo_path_idx" ON "context_attachments" USING btree ("repo_id","path");--> statement-breakpoint
CREATE INDEX "context_attachments_owner_idx" ON "context_attachments" USING btree ("owner_type","owner_id");