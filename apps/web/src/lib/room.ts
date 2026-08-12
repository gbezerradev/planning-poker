import { db } from "@ponto-next/db";
import { participants, rooms, stories, votes } from "@ponto-next/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";

const STARTER_STORIES = [
  {
    key: "PP-241",
    title: "Novo fluxo de checkout em uma página",
    description: "Como cliente, quero concluir minha compra sem trocar de página para reduzir o abandono no carrinho.",
    tag: "Produto",
  },
  {
    key: "PP-242",
    title: "Permitir login com passkey",
    description: "Como cliente, quero acessar minha conta com passkey para entrar com mais segurança e menos atrito.",
    tag: "Segurança",
  },
  {
    key: "PP-238",
    title: "Dashboard de métricas da equipe",
    description: "Como liderança, quero acompanhar as principais métricas da sprint em um único lugar.",
    tag: "Analytics",
  },
  {
    key: "PP-235",
    title: "Histórico de notificações",
    description: "Como usuário, quero consultar notificações antigas para não perder nenhuma atualização.",
    tag: "Produto",
  },
];

export async function ensureRoom(code: string) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rooms (
      code text PRIMARY KEY,
      name text NOT NULL,
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
  `);

  await db.insert(rooms).values({ code, name: code === "aurora" ? "Sprint Aurora" : `Sala ${code}` }).onConflictDoNothing();
  const currentStories = await db.select().from(stories).where(eq(stories.roomCode, code));

  if (currentStories.length === 0) {
    const inserted = await db
      .insert(stories)
      .values(STARTER_STORIES.map((story, position) => ({ ...story, position, roomCode: code })))
      .returning();
    await db.update(rooms).set({ activeStoryId: inserted[0]?.id }).where(eq(rooms.code, code));
  }
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
  const participantRows = await db.select().from(participants).where(eq(participants.roomCode, code));
  const voteRows = activeStory
    ? await db
        .select()
        .from(votes)
        .where(and(eq(votes.roomCode, code), eq(votes.storyId, activeStory.id), eq(votes.round, room.round)))
    : [];

  const numericVotes = voteRows.map((vote) => Number(vote.value)).filter((vote) => Number.isFinite(vote));
  const average = numericVotes.length
    ? Math.round((numericVotes.reduce((sum, vote) => sum + vote, 0) / numericVotes.length) * 10) / 10
    : 0;
  const counts = numericVotes.reduce<Record<number, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
  const agreement = numericVotes.length > 1
    ? Math.round((Math.max(...Object.values(counts)) / numericVotes.length) * 100)
    : 0;

  return {
    room,
    stories: storyRows,
    participants: participantRows.map((participant) => {
      const vote = voteRows.find((item) => item.participantId === participant.id);
      return {
        ...participant,
        voted: Boolean(vote),
        vote: room.revealed || participant.id === participantId ? vote?.value ?? null : null,
      };
    }),
    result: { average, agreement, votedCount: voteRows.length },
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
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
    const colors = ["plum", "coral", "lime", "blue", "gold"];
    const color = colors[[...participantId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
    await db.insert(participants).values({ roomCode: code, id: participantId, name, initials, color: color ?? "plum" })
      .onConflictDoUpdate({ target: [participants.roomCode, participants.id], set: { name, initials, color: color ?? "plum", lastSeenAt: new Date() } });
    return;
  }

  if (action === "vote") {
    const value = String(input.value ?? "");
    if (!room.activeStoryId || !["0", "1", "2", "3", "5", "8", "13", "21", "?", "☕"].includes(value)) return;
    await db.insert(votes).values({ roomCode: code, storyId: room.activeStoryId, participantId, round: room.round, value })
      .onConflictDoUpdate({ target: [votes.roomCode, votes.storyId, votes.participantId, votes.round], set: { value } });
    return;
  }

  if (action === "reveal") {
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
    const next = remaining.find((story) => story.id !== room.activeStoryId);
    await db.update(rooms).set({ activeStoryId: next?.id ?? room.activeStoryId, revealed: false, round: room.round + 1 }).where(eq(rooms.code, code));
  }
}
