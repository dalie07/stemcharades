CREATE TABLE "card_stats" (
	"card_id" text PRIMARY KEY NOT NULL,
	"times_played" integer DEFAULT 0 NOT NULL,
	"times_guessed" integer DEFAULT 0 NOT NULL,
	"avg_seconds_to_guess" real
);
--> statement-breakpoint
CREATE TABLE "custom_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"topic" text NOT NULL,
	"level" integer NOT NULL,
	"prompt" text NOT NULL,
	"latex" text,
	"answers" jsonb NOT NULL,
	"forbidden" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	"room_size" integer NOT NULL,
	"rounds" integer NOT NULL,
	"settings" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missed_cards" (
	"user_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"last_missed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "missed_cards_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "player_results" (
	"game_result_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "player_results_game_result_id_user_id_pk" PRIMARY KEY("game_result_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oauth_provider" text NOT NULL,
	"oauth_subject" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_cards" ADD CONSTRAINT "custom_cards_deck_id_custom_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."custom_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_decks" ADD CONSTRAINT "custom_decks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missed_cards" ADD CONSTRAINT "missed_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_results" ADD CONSTRAINT "player_results_game_result_id_game_results_id_fk" FOREIGN KEY ("game_result_id") REFERENCES "public"."game_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_results" ADD CONSTRAINT "player_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_cards_deck_idx" ON "custom_cards" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "custom_decks_owner_idx" ON "custom_decks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "player_results_user_idx" ON "player_results" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_oauth_idx" ON "users" USING btree ("oauth_provider","oauth_subject");