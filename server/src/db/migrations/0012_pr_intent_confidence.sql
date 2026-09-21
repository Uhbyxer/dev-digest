ALTER TABLE "pr_intent" ADD COLUMN "confidence" text DEFAULT 'inferred' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;