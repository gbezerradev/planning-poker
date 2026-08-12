CREATE TABLE "participants" (
	"room_code" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"role" text DEFAULT 'Time' NOT NULL,
	"color" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_room_code_id_pk" PRIMARY KEY("room_code","id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"active_story_id" integer
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_code" text NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"tag" text NOT NULL,
	"position" integer NOT NULL,
	"estimate" integer
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_code" text NOT NULL,
	"story_id" integer NOT NULL,
	"participant_id" text NOT NULL,
	"round" integer NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "votes_round_participant_idx" ON "votes" USING btree ("room_code","story_id","participant_id","round");