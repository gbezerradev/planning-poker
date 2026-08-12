import { boolean, integer, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const rooms = pgTable("rooms", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  revealed: boolean("revealed").notNull().default(false),
  round: integer("round").notNull().default(1),
  activeStoryId: integer("active_story_id"),
});

export const stories = pgTable("stories", {
  id: serial("id").primaryKey(),
  roomCode: text("room_code").notNull(),
  key: text("key").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  notes: text("notes").notNull().default(""),
  tag: text("tag").notNull(),
  position: integer("position").notNull(),
  estimate: integer("estimate"),
});

export const participants = pgTable(
  "participants",
  {
    roomCode: text("room_code").notNull(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    initials: text("initials").notNull(),
    role: text("role").notNull().default("Time"),
    color: text("color").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.roomCode, table.id] })]
);

export const votes = pgTable(
  "votes",
  {
    id: serial("id").primaryKey(),
    roomCode: text("room_code").notNull(),
    storyId: integer("story_id").notNull(),
    participantId: text("participant_id").notNull(),
    round: integer("round").notNull(),
    value: text("value").notNull(),
  },
  (table) => [
    uniqueIndex("votes_round_participant_idx").on(
      table.roomCode,
      table.storyId,
      table.participantId,
      table.round
    ),
  ]
);
