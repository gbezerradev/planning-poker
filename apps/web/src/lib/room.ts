import { createHash, randomBytes } from "node:crypto";
import { db } from "@ponto-next/db";
import { participants, rooms, stories, votes } from "@ponto-next/db/schema";
import { and, asc, eq, gte, sql } from "drizzle-orm";

const PRESENCE_TIMEOUT_MS = 5 * 60_000;
const STORY_POINTS = [0, 1, 2, 3, 5, 8, 13, 21] as const;

function getClosestStoryPoint(value: number) {
  return STORY_POINTS.reduce((closest, storyPoint) =>
    Math.abs(storyPoint - value) <= Math.abs(closest - value) ? storyPoint : closest
  );
}

function getParticipantEntryTime(participantId: string) {
  const match = /^presence_(\d+)_/.exec(participantId);
  return match?.[1] ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export class RoomActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RoomActionError";
  }
}

function hashFacilitatorToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hasValidFacilitatorToken(tokenHash: string | null, token: string) {
  return Boolean(tokenHash && token && hashFacilitatorToken(token) === tokenHash);
}

export async function ensureRoom(code: string, roomName?: string, facilitatorTokenHash?: string) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rooms (
      code text PRIMARY KEY,
      name text NOT NULL,
      facilitator_token_hash text,
      revealed boolean NOT NULL DEFAULT false,
      round integer NOT NULL DEFAULT 1,
      active_story_id integer
    );
    CREATE TABLE IF NOT EXISTS stories (
      id serial PRIMARY KEY,
      room_code text NOT NULL,
      key text NOT NULL,
      title text NOT NULL,
      description text NOT NULL,
      notes text NOT NULL DEFAULT '',
      tag text NOT NULL,
      position integer NOT NULL,
      estimate integer
    );
    CREATE TABLE IF NOT EXISTS participants (
      room_code text NOT NULL,
      id text NOT NULL,
      name text NOT NULL,
      initials text NOT NULL,
      role text NOT NULL DEFAULT 'Time',
      color text NOT NULL,
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (room_code, id)
    );
    CREATE TABLE IF NOT EXISTS votes (
      id serial PRIMARY KEY,
      room_code text NOT NULL,
      story_id integer NOT NULL,
      participant_id text NOT NULL,
      round integer NOT NULL,
      value text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS votes_round_participant_idx
      ON votes (room_code, story_id, participant_id, round);
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS facilitator_token_hash text;
    ALTER TABLE stories ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
  `);

  await db.insert(rooms).values({
    code,
    name: roomName?.trim().slice(0, 60) || `Sala ${code}`,
    facilitatorTokenHash: facilitatorTokenHash ?? null,
  }).onConflictDoNothing();
}

export async function createRoom(name: string) {
  const code = randomBytes(6).toString("hex");
  const facilitatorToken = randomBytes(32).toString("hex");
  await ensureRoom(code, name, hashFacilitatorToken(facilitatorToken));
  return { code, facilitatorToken };
}

export async function getRoomState(code: string, participantId?: string | null) {
  await ensureRoom(code);
  if (participantId) {
    await db
      .update(participants)
      .set({ lastSeenAt: new Date() })
      .where(and(eq(participants.roomCode, code), eq(participants.id, participantId)));
  }

  const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
  if (!room) throw new Error("Sala não encontrada");

  const storyRows = await db.select().from(stories).where(eq(stories.roomCode, code)).orderBy(asc(stories.position));
  const activeStory = storyRows.find((story) => story.id === room.activeStoryId) ?? storyRows[0];
  const participantRows = (await db
    .select()
    .from(participants)
    .where(and(
      eq(participants.roomCode, code),
      gte(participants.lastSeenAt, new Date(Date.now() - PRESENCE_TIMEOUT_MS))
    ))).sort((first, second) => {
      const entryDifference = getParticipantEntryTime(first.id) - getParticipantEntryTime(second.id);
      return entryDifference || first.id.localeCompare(second.id);
    });
  const onlineParticipantIds = new Set(participantRows.map((participant) => participant.id));
  const voteRows = (activeStory
    ? await db
        .select()
        .from(votes)
        .where(and(eq(votes.roomCode, code), eq(votes.storyId, activeStory.id), eq(votes.round, room.round)))
    : []).filter((vote) => onlineParticipantIds.has(vote.participantId));

  const numericVotes = voteRows.map((vote) => Number(vote.value)).filter((vote) => Number.isFinite(vote));
  const average = numericVotes.length
    ? Math.round((numericVotes.reduce((sum, vote) => sum + vote, 0) / numericVotes.length) * 10) / 10
    : 0;
  const suggestedEstimate = numericVotes.length ? getClosestStoryPoint(average) : null;
  const counts = numericVotes.reduce<Record<number, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
  const agreement = numericVotes.length > 1
    ? Math.round((Math.max(...Object.values(counts)) / numericVotes.length) * 100)
    : 0;

  const { facilitatorTokenHash: _facilitatorTokenHash, ...publicRoom } = room;

  return {
    room: publicRoom,
    stories: storyRows,
    participants: participantRows.map((participant) => {
      const vote = voteRows.find((item) => item.participantId === participant.id);
      return {
        ...participant,
        voted: Boolean(vote),
        vote: room.revealed || participant.id === participantId ? vote?.value ?? null : null,
      };
    }),
    result: { suggestedEstimate, agreement, votedCount: voteRows.length },
  };
}

export async function applyRoomAction(code: string, input: Record<string, unknown>) {
  await ensureRoom(code);
  const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
  if (!room) throw new Error("Sala não encontrada");

  const action = String(input.action ?? "");
  const participantId = String(input.participantId ?? "").slice(0, 80);

  if (action === "join") {
    const name = String(input.name ?? "Pessoa").trim().slice(0, 40) || "Pessoa";
    const facilitatorToken = String(input.facilitatorToken ?? "");
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
    const colors = ["plum", "coral", "lime", "blue", "gold"];
    const color = colors[[...participantId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
    const currentParticipants = await db.select().from(participants).where(eq(participants.roomCode, code));
    const existingParticipant = currentParticipants.find((participant) => participant.id === participantId);
    const role = hasValidFacilitatorToken(room.facilitatorTokenHash, facilitatorToken)
      ? "Facilitador"
      : !room.facilitatorTokenHash
        ? existingParticipant?.role ?? (currentParticipants.length === 0 ? "Facilitador" : "Time")
        : "Time";
    await db.insert(participants).values({ roomCode: code, id: participantId, name, initials, role, color: color ?? "plum" })
      .onConflictDoUpdate({ target: [participants.roomCode, participants.id], set: { name, initials, role, color: color ?? "plum", lastSeenAt: new Date() } });
    return;
  }

  if (action === "leave" && participantId) {
    await db
      .update(participants)
      .set({ lastSeenAt: new Date(0) })
      .where(and(eq(participants.roomCode, code), eq(participants.id, participantId)));
    return;
  }

  if (action === "addStory") {
    const title = String(input.title ?? "").trim().slice(0, 140);
    if (!title) return;
    const description = String(input.description ?? "").trim().slice(0, 1200);
    const tag = String(input.tag ?? "Produto").trim().slice(0, 30) || "Produto";
    const key = String(input.key ?? "").trim().slice(0, 20) || `PP-${randomBytes(2).toString("hex").toUpperCase()}`;
    const currentStories = await db.select().from(stories).where(eq(stories.roomCode, code));
    const [created] = await db.insert(stories).values({
      roomCode: code,
      key,
      title,
      description: description || "Sem descrição adicionada.",
      notes: "",
      tag,
      position: currentStories.length,
    }).returning();
    if (created) {
      await db.update(rooms).set({
        activeStoryId: created.id,
        revealed: false,
        round: room.round + 1,
      }).where(eq(rooms.code, code));
    }
    return;
  }

  if (action === "updateNotes") {
    const storyId = Number(input.storyId);
    const notes = String(input.notes ?? "").slice(0, 5000);
    await db.update(stories).set({ notes }).where(and(eq(stories.roomCode, code), eq(stories.id, storyId)));
    return;
  }

  if (action === "vote") {
    const value = String(input.value ?? "");
    if (!room.activeStoryId || !["0", "1", "2", "3", "5", "8", "13", "21", "?", "☕"].includes(value)) return;
    const [activeStory] = await db
      .select()
      .from(stories)
      .where(and(eq(stories.roomCode, code), eq(stories.id, room.activeStoryId)));
    if (!activeStory || activeStory.estimate !== null) return;
    await db.insert(votes).values({ roomCode: code, storyId: room.activeStoryId, participantId, round: room.round, value })
      .onConflictDoUpdate({ target: [votes.roomCode, votes.storyId, votes.participantId, votes.round], set: { value } });
    return;
  }

  if (action === "reveal") {
    const facilitatorToken = String(input.facilitatorToken ?? "");
    let canReveal = hasValidFacilitatorToken(room.facilitatorTokenHash, facilitatorToken);

    // Salas criadas antes do token de facilitador continuam funcionando.
    if (!room.facilitatorTokenHash && participantId) {
      const [requester] = await db
        .select({ role: participants.role })
        .from(participants)
        .where(and(eq(participants.roomCode, code), eq(participants.id, participantId)));
      canReveal = requester?.role === "Facilitador";
    }

    if (!canReveal) {
      throw new RoomActionError("Somente o facilitador pode revelar as cartas", 403);
    }
    await db.update(rooms).set({ revealed: true }).where(eq(rooms.code, code));
    return;
  }

  if (action === "reset") {
    await db.update(rooms).set({ revealed: false, round: room.round + 1 }).where(eq(rooms.code, code));
    return;
  }

  if (action === "activate") {
    const storyId = Number(input.storyId);
    await db.update(rooms).set({ activeStoryId: storyId, revealed: false, round: room.round + 1 }).where(eq(rooms.code, code));
    return;
  }

  if (action === "accept" && room.activeStoryId) {
    const estimate = Number(input.estimate);
    await db.update(stories).set({ estimate }).where(and(eq(stories.roomCode, code), eq(stories.id, room.activeStoryId)));
    const remaining = await db.select().from(stories).where(and(eq(stories.roomCode, code), sql`${stories.estimate} IS NULL`)).orderBy(asc(stories.position));
    const next = remaining[0];
    await db.update(rooms).set({ activeStoryId: next?.id ?? room.activeStoryId, revealed: false, round: room.round + 1 }).where(eq(rooms.code, code));
  }
}
