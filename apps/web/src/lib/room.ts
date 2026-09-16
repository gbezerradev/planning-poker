import { createHash, randomBytes } from "node:crypto";

const PARTICIPANT_TIMEOUT_MS = 5 * 60_000;
const ROOM_TIMEOUT_MS = 30 * 60_000;
const ROOM_CODE_PATTERN = /^[a-f0-9]{12}$/;
const ESTIMATE_POINTS = [0, 1, 2, 3, 5, 8, 13, 21] as const;
const VALID_CARDS = ["0", "1", "2", "3", "5", "8", "13", "21", "?", "☕"] as const;

type ParticipantState = {
  id: string;
  participantTokenHash: string;
  name: string;
  initials: string;
  role: string;
  color: string;
  lastSeenAt: number;
};

type RoomState = {
  code: string;
  name: string;
  facilitatorTokenHash: string | null;
  revealed: boolean;
  participants: Map<string, ParticipantState>;
  votes: Map<string, string>;
  lastActivityAt: number;
};

type RoomStore = Map<string, RoomState>;

const globalRoomStore = globalThis as typeof globalThis & { __pontoRoomStore?: RoomStore };
const roomStore = globalRoomStore.__pontoRoomStore ?? (globalRoomStore.__pontoRoomStore = new Map());

function getClosestEstimate(value: number) {
  return ESTIMATE_POINTS.reduce((closest, estimatePoint) =>
    Math.abs(estimatePoint - value) <= Math.abs(closest - value) ? estimatePoint : closest
  );
}

function getParticipantEntryTime(participantId: string) {
  const match = /^presence_(\d+)_/.exec(participantId);
  return match?.[1] ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function hashFacilitatorToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hasValidFacilitatorToken(tokenHash: string | null, token: string) {
  return Boolean(tokenHash && token && hashFacilitatorToken(token) === tokenHash);
}

function hashParticipantToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hasValidParticipantToken(participant: ParticipantState | undefined, token: string) {
  return Boolean(participant && token && hashParticipantToken(token) === participant.participantTokenHash);
}

function createRoomState(code: string, name: string, facilitatorTokenHash: string | null): RoomState {
  return {
    code,
    name: name.trim().slice(0, 60) || `Sala ${code}`,
    facilitatorTokenHash,
    revealed: false,
    participants: new Map(),
    votes: new Map(),
    lastActivityAt: Date.now(),
  };
}

function getOrCreateRoom(code: string, roomName?: string, facilitatorTokenHash?: string) {
  const existingRoom = roomStore.get(code);
  if (existingRoom) {
    existingRoom.lastActivityAt = Date.now();
    return existingRoom;
  }

  const room = createRoomState(code, roomName ?? `Sala ${code}`, facilitatorTokenHash ?? null);
  roomStore.set(code, room);
  return room;
}

export function normalizeRoomCode(code: string) {
  return code.trim().toLowerCase();
}

function getExistingRoom(code: string) {
  const normalizedCode = normalizeRoomCode(code);
  if (!ROOM_CODE_PATTERN.test(normalizedCode)) {
    throw new RoomActionError("Sala não encontrada", 404);
  }

  const room = roomStore.get(normalizedCode);
  if (!room) {
    throw new RoomActionError("Sala não encontrada", 404);
  }

  room.lastActivityAt = Date.now();
  return room;
}

function pruneInactiveRooms() {
  const now = Date.now();

  for (const [code, room] of roomStore) {
    if (now - room.lastActivityAt > ROOM_TIMEOUT_MS) {
      roomStore.delete(code);
      continue;
    }

    for (const [participantId, participant] of room.participants) {
      if (now - participant.lastSeenAt > PARTICIPANT_TIMEOUT_MS) {
        room.participants.delete(participantId);
        room.votes.delete(participantId);
      }
    }
  }
}

export class RoomActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RoomActionError";
  }
}

export function roomExists(code: string) {
  pruneInactiveRooms();
  const normalizedCode = normalizeRoomCode(code);
  return ROOM_CODE_PATTERN.test(normalizedCode) && roomStore.has(normalizedCode);
}

export async function createRoom(name: string) {
  const code = randomBytes(6).toString("hex");
  const facilitatorToken = randomBytes(32).toString("hex");
  getOrCreateRoom(code, name, hashFacilitatorToken(facilitatorToken));
  return { code, facilitatorToken };
}

export async function getRoomState(code: string, participantId?: string | null, participantToken?: string | null) {
  pruneInactiveRooms();
  const room = getExistingRoom(code);

  const currentParticipant = participantId ? room.participants.get(participantId) : undefined;
  const isCurrentParticipant = hasValidParticipantToken(currentParticipant, participantToken ?? "");
  if (isCurrentParticipant && currentParticipant) currentParticipant.lastSeenAt = Date.now();

  room.lastActivityAt = Date.now();
  const onlineParticipants = [...room.participants.values()]
    .filter((participant) => Date.now() - participant.lastSeenAt <= PARTICIPANT_TIMEOUT_MS)
    .sort((first, second) => {
      const entryDifference = getParticipantEntryTime(first.id) - getParticipantEntryTime(second.id);
      return entryDifference || first.id.localeCompare(second.id);
    });
  const onlineParticipantIds = new Set(onlineParticipants.map((participant) => participant.id));
  const voteEntries = [...room.votes.entries()].filter(([id]) => onlineParticipantIds.has(id));
  const numericVotes = voteEntries.map(([, value]) => Number(value)).filter((value) => Number.isFinite(value));
  const average = numericVotes.length
    ? Math.round((numericVotes.reduce((sum, vote) => sum + vote, 0) / numericVotes.length) * 10) / 10
    : 0;
  const suggestedEstimate = numericVotes.length ? getClosestEstimate(average) : null;
  const counts = numericVotes.reduce<Record<number, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
  const agreement = numericVotes.length > 1
    ? Math.round((Math.max(...Object.values(counts)) / numericVotes.length) * 100)
    : 0;

  return {
    room: {
      code: room.code,
      name: room.name,
      revealed: room.revealed,
    },
    participants: onlineParticipants.map((participant) => {
      const vote = room.votes.get(participant.id) ?? null;
      return {
        id: participant.id,
        name: participant.name,
        initials: participant.initials,
        role: participant.role,
        color: participant.color,
        voted: vote !== null,
        vote: room.revealed || (participant.id === participantId && isCurrentParticipant) ? vote : null,
      };
    }),
    result: { suggestedEstimate, agreement, votedCount: voteEntries.length },
  };
}

export async function applyRoomAction(code: string, input: Record<string, unknown>) {
  pruneInactiveRooms();
  const room = getExistingRoom(code);
  const action = String(input.action ?? "");
  const participantId = String(input.participantId ?? "").slice(0, 80);

  if (action === "join") {
    if (!participantId) return;
    const name = String(input.name ?? "Pessoa").trim().slice(0, 40) || "Pessoa";
    const facilitatorToken = String(input.facilitatorToken ?? "");
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
    const colors = ["plum", "coral", "lime", "blue", "gold"];
    const color = colors[[...participantId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length] ?? "plum";
    const existingParticipant = room.participants.get(participantId);
    if (existingParticipant && !hasValidParticipantToken(existingParticipant, String(input.participantToken ?? ""))) {
      throw new RoomActionError("Sessão do participante inválida", 403);
    }
    const participantToken = existingParticipant
      ? String(input.participantToken)
      : randomBytes(32).toString("hex");
    const role = hasValidFacilitatorToken(room.facilitatorTokenHash, facilitatorToken)
      ? "Facilitador"
      : existingParticipant?.role ?? "Time";

    room.participants.set(participantId, {
      id: participantId,
      participantTokenHash: hashParticipantToken(participantToken),
      name,
      initials,
      role,
      color,
      lastSeenAt: Date.now(),
    });
    room.lastActivityAt = Date.now();
    return { participantToken };
  }

  if (action === "leave" && participantId) {
    const participant = room.participants.get(participantId);
    if (!hasValidParticipantToken(participant, String(input.participantToken ?? ""))) {
      throw new RoomActionError("Sessão do participante inválida", 403);
    }
    room.participants.delete(participantId);
    room.votes.delete(participantId);
    room.lastActivityAt = Date.now();
    return;
  }

  if (action === "vote") {
    const value = String(input.value ?? "");
    const participant = room.participants.get(participantId);
    if (!hasValidParticipantToken(participant, String(input.participantToken ?? ""))) {
      throw new RoomActionError("Sessão do participante inválida", 403);
    }
    if (room.revealed || !VALID_CARDS.includes(value as typeof VALID_CARDS[number])) return;
    room.votes.set(participantId, value);
    participant.lastSeenAt = Date.now();
    room.lastActivityAt = Date.now();
    return;
  }

  if (action === "reveal") {
    const facilitatorToken = String(input.facilitatorToken ?? "");
    let canReveal = hasValidFacilitatorToken(room.facilitatorTokenHash, facilitatorToken);

    if (!room.facilitatorTokenHash && participantId) {
      canReveal = room.participants.get(participantId)?.role === "Facilitador";
    }

    if (!canReveal) {
      throw new RoomActionError("Somente o facilitador pode revelar as cartas", 403);
    }
    room.revealed = true;
    room.lastActivityAt = Date.now();
    return;
  }

  if (action === "reset") {
    const facilitatorToken = String(input.facilitatorToken ?? "");
    if (!hasValidFacilitatorToken(room.facilitatorTokenHash, facilitatorToken)) {
      throw new RoomActionError("Somente o facilitador pode iniciar uma nova votação", 403);
    }
    room.revealed = false;
    room.votes.clear();
    room.lastActivityAt = Date.now();
  }
}
