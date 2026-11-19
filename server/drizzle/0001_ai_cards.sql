CREATE TABLE "generated_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_key" text NOT NULL,
	"card" jsonb NOT NULL,
	"served" integer DEFAULT 0 NOT NULL,
	"reporters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retired" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "generated_cards_topic_idx" ON "generated_cards" USING btree ("topic_key");