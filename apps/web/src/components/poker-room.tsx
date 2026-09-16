"use client";

import {
  ArrowRight,
  Check,
  ChevronDown,
  Coffee,
  Copy,
  LayoutGrid,
  List,
  RotateCcw,
  Sparkles,
  Timer,
  Users,
  WifiOff,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const DECK = ["0", "1", "2", "3", "5", "8", "13", "21", "?", "☕"];
const TABLE_SEAT_LIMIT = 8;

type Participant = {
  id: string;
  name: string;
  initials: string;
  role: string;
  color: string;
  voted: boolean;
  vote: string | null;
};

type RoomPayload = {
  room: { code: string; name: string; revealed: boolean };
  participants: Participant[];
  result: { suggestedEstimate: number | null; agreement: number; votedCount: number };
};

function getVoteStatus(participant: Participant, revealed: boolean) {
  if (!participant.voted) return "Aguardando";
  if (!revealed) return "Voto enviado";
  if (participant.vote === "☕") return "Pausa";
  if (participant.vote === "?") return "Não sabe";
  return participant.vote ? `${participant.vote} pontos` : "Sem voto";
}

export default function PokerRoom({ roomCode }: { roomCode: string }) {
  const [room, setRoom] = useState<RoomPayload | null>(null);
  const [participantId, setParticipantId] = useState("");
  const [facilitatorToken, setFacilitatorToken] = useState("");
  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [viewMode, setViewMode] = useState<"table" | "list">("table");

  const loadRoom = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/rooms/${roomCode}?participantId=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("offline");
      const data = (await response.json()) as RoomPayload;
      setRoom(data);
      setConnectionError(false);
      const me = data.participants.find((participant) => participant.id === id);
      setSelected(me?.vote ?? null);
    } catch {
      setConnectionError(true);
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  const sendAction = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch(`/api/rooms/${roomCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, participantId, facilitatorToken }),
    });
    if (!response.ok) throw new Error("Não foi possível atualizar a sala");
    await loadRoom(participantId);
  }, [facilitatorToken, loadRoom, participantId, roomCode]);

  useEffect(() => {
    const participantStorageKey = `ponto_participant_${roomCode}`;
    let id = sessionStorage.getItem(participantStorageKey);
    if (!id) {
      id = `presence_${Date.now()}_${crypto.randomUUID()}`;
      sessionStorage.setItem(participantStorageKey, id);
    }
    const savedName = localStorage.getItem("ponto_name") ?? "";
    const savedFacilitatorToken = localStorage.getItem(`ponto_facilitator_${roomCode}`) ?? "";
    setFacilitatorToken(savedFacilitatorToken);
    setParticipantId(id);
    setName(savedName);
    setNameInput(savedName);
    if (savedName) {
      fetch(`/api/rooms/${roomCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          participantId: id,
          name: savedName,
          facilitatorToken: savedFacilitatorToken,
        }),
      }).then(() => loadRoom(id));
    } else {
      setLoading(false);
    }
  }, [loadRoom, roomCode]);

  useEffect(() => {
    if (!participantId || !name) return;
    const interval = window.setInterval(() => loadRoom(participantId), 2000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadRoom(participantId);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadRoom, name, participantId]);

  useEffect(() => {
    if (!participantId || !name) return;
    const leaveRoom = () => {
      const body = JSON.stringify({ action: "leave", participantId });
      const queued = navigator.sendBeacon(`/api/rooms/${roomCode}`, new Blob([body], { type: "application/json" }));
      if (!queued) {
        void fetch(`/api/rooms/${roomCode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      }
    };
    window.addEventListener("beforeunload", leaveRoom);
    return () => {
      window.removeEventListener("beforeunload", leaveRoom);
    };
  }, [name, participantId, roomCode]);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  const reveal = useCallback(async () => {
    const isFacilitator = room?.participants.some(
      (participant) => participant.id === participantId && participant.role === "Facilitador"
    );
    if (!isFacilitator) return;
    if (!selected) {
      toast.error("Escolha uma carta antes de revelar os votos.");
      return;
    }
    await sendAction({ action: "reveal" });
  }, [participantId, room?.participants, selected, sendAction]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.tagName === "INPUT") return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < 8 && !room?.room.revealed) {
        const value = DECK[index];
        if (value) void chooseCard(value);
      }
      if (event.key.toLowerCase() === "r") void reveal();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanName = nameInput.trim();
    if (!cleanName || !participantId) return;
    setJoining(true);
    try {
      await sendAction({ action: "join", name: cleanName });
      localStorage.setItem("ponto_name", cleanName);
      setName(cleanName);
      toast.success(`Bem-vindo à mesa, ${cleanName}!`);
    } catch {
      toast.error("Não foi possível entrar na sala. Verifique o banco de dados.");
    } finally {
      setJoining(false);
    }
  };

  const chooseCard = async (value: string) => {
    if (room?.room.revealed) return;
    setSelected(value);
    try {
      await sendAction({ action: "vote", value });
    } catch {
      toast.error("Não foi possível registrar seu voto.");
    }
  };

  const resetRound = async () => {
    setSelected(null);
    await sendAction({ action: "reset" });
    toast("Nova rodada iniciada", { description: "As cartas voltaram para a mão." });
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success("Link da sala copiado!");
  };

  const me = room?.participants.find((participant) => participant.id === participantId);
  const isFacilitator = me?.role === "Facilitador";
  const presentParticipants = useMemo(() => room?.participants ?? [], [room?.participants]);
  const tableParticipants = useMemo(() => presentParticipants.slice(0, TABLE_SEAT_LIMIT), [presentParticipants]);
  const tableSeats = useMemo(() => {
    return tableParticipants.map((participant, index) => {
      const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / tableParticipants.length);
      return {
        participant,
        style: {
          "--seat-x": `${50 + (Math.cos(angle) * 39)}%`,
          "--seat-y": `${50 + (Math.sin(angle) * 38)}%`,
        } as CSSProperties,
      };
    });
  }, [tableParticipants]);
  const displayedPlayers = viewMode === "list"
    ? presentParticipants.map((participant) => ({ participant, style: undefined }))
    : tableSeats;
  const timerLabel = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Poker home">
          <span className="brand-mark" aria-hidden="true" />
          <span>POKER</span>
        </a>
        <div className="room-identity">
          <span className={`live-dot ${connectionError ? "is-offline" : ""}`} />
          <div><strong>{room?.room.name ?? "Carregando sala"}</strong><small>Sala #{roomCode}</small></div>
          <ChevronDown size={16} />
        </div>
        <div className="top-actions">
          {connectionError && <span className="offline-badge"><WifiOff size={13} /> sem conexão</span>}
          <button className={`timer-button ${timerRunning ? "is-running" : ""}`} onClick={() => setTimerRunning(!timerRunning)}>
            <Timer size={17} /><span>{timerRunning || seconds ? timerLabel : "Timer"}</span>
          </button>
          <button className="invite-button" onClick={copyInvite}><Copy size={16} />Convidar</button>
          <button className={`avatar avatar-${me?.color ?? "plum"}`} title={name || "Você"} onClick={() => { setName(""); setNameInput(name); }}>
            {me?.initials || name.slice(0, 2).toUpperCase() || "EU"}
          </button>
        </div>
      </header>

      <div className="workspace">
        <section className="game-area">
          <div className="game-content">
          <div className="voting-header">
            <div>
              <h1>Uma decisão por vez.</h1>
              <p>Escolham uma carta, revelem os votos e busquem consenso juntos.</p>
            </div>
            <div className="voting-presence">
              <Users size={17} />
              <span><strong>{presentParticipants.length} {presentParticipants.length === 1 ? "pessoa" : "pessoas"}</strong><small>na sala agora</small></span>
            </div>
          </div>

          <div className="view-toolbar">
            <div>
              <span className="eyebrow">VISUALIZAÇÃO</span>
              <strong>{viewMode === "table" && presentParticipants.length > TABLE_SEAT_LIMIT
                ? `${TABLE_SEAT_LIMIT} de ${presentParticipants.length} pessoas na mesa · primeiras a entrar`
                : `${presentParticipants.length} ${presentParticipants.length === 1 ? "pessoa na rodada" : "pessoas na rodada"}`}</strong>
            </div>
            <div className="view-switcher" role="group" aria-label="Visualização dos votos">
              <button type="button" className={viewMode === "table" ? "is-active" : ""} aria-pressed={viewMode === "table"} onClick={() => setViewMode("table")}><LayoutGrid size={15} /> Mesa</button>
              <button type="button" className={viewMode === "list" ? "is-active" : ""} aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}><List size={15} /> Lista</button>
            </div>
          </div>

          <div className={`poker-table ${viewMode === "list" ? "is-list-view" : ""} ${room?.room.revealed ? "is-revealed" : ""}`}>
            <div className="table-orbit" />
            <div className="table-center">
              {room?.room.revealed ? (
                <>
                  <span className="result-kicker"><Sparkles size={15} /> VOTOS REVELADOS</span>
                  <strong className="average-number">{room.result.suggestedEstimate ?? "—"}</strong>
                  <span className="average-label">estimativa sugerida</span>
                  <div className="agreement"><span style={{ width: `${room.result.agreement}%` }} /><b>{room.result.agreement}% acordo</b></div>
                </>
              ) : (
                <>
                  <span className="waiting-icon"><span /><span /><span /></span>
                  <strong>{room?.result.votedCount ?? 0} de {room?.participants.length ?? 0} votaram</strong>
                  <small>Os votos ficam ocultos até a revelação</small>
                  {isFacilitator ? (
                    <button type="button" className="reveal-button" onClick={reveal}>Revelar cartas <Sparkles size={16} /></button>
                  ) : (
                    <small>Aguardando o facilitador revelar as cartas</small>
                  )}
                </>
              )}
            </div>

            <div className={`players-grid ${displayedPlayers.length > TABLE_SEAT_LIMIT ? "is-crowded" : ""}`}>
              {displayedPlayers.map(({ participant, style }) => (
                <div className="player" key={participant.id} style={style}>
                  <div className={`vote-card ${participant.voted ? "has-vote" : ""} ${room?.room.revealed && participant.vote ? "show-value" : ""}`}>
                    {room?.room.revealed && participant.vote ? <b>{participant.vote}</b> : participant.voted ? <span className="card-pattern">P</span> : <span className="waiting-mark">•••</span>}
                  </div>
                  <div className={`avatar avatar-${participant.color}`}>{participant.initials}</div>
                  <div className="player-copy"><strong>{participant.name}{participant.id === participantId && <em>você</em>}</strong><small>{participant.role}</small></div>
                  <span className="list-vote-status">{getVoteStatus(participant, Boolean(room?.room.revealed))}</span>
                  {participant.voted && <span className="voted-check"><Check size={11} /></span>}
                </div>
              ))}
            </div>
          </div>

          {room?.room.revealed && isFacilitator && (
            <div className="round-actions">
              <button className="secondary-action" onClick={resetRound}><RotateCcw size={16} /> Nova votação</button>
            </div>
          )}

          <div className="deck-area">
            <div className="deck-heading"><div><span className="eyebrow">SUA ESTIMATIVA</span><h2>{selected ? `Você escolheu ${selected}` : "Escolha uma carta"}</h2></div><span>Escala Fibonacci</span></div>
            <div className="deck" role="list" aria-label="Cartas de estimativa">
              {DECK.map((card) => (
                <button key={card} className={`deck-card ${selected === card ? "is-selected" : ""}`} onClick={() => chooseCard(card)} disabled={room?.room.revealed || !name} aria-label={card === "☕" ? "Pedir uma pausa" : `Estimar ${card} pontos`}>
                  {card === "☕" ? <Coffee size={22} /> : card}
                  {selected === card && <span><Check size={12} /></span>}
                </button>
              ))}
            </div>
            <p className="deck-tip"><kbd>1–8</kbd> para votar <i /> <kbd>R</kbd> para revelar</p>
          </div>
          </div>
        </section>
      </div>

      {!name && !loading && (
        <div className="join-overlay">
          <form className="join-card" onSubmit={join}>
            <span className="join-mark"><Sparkles size={21} /></span>
            <span className="eyebrow">SALA #{roomCode.toUpperCase()}</span>
            <h2>Chegue mais perto da mesa.</h2>
            <p>Sem cadastro. Digite seu nome e comece a estimar com o time.</p>
            <label htmlFor="name">Como podemos te chamar?</label>
            <input id="name" autoFocus maxLength={40} value={nameInput} onChange={(event) => setNameInput(event.target.value)} placeholder="Seu nome" />
            <button type="submit" disabled={!nameInput.trim() || joining}>{joining ? "Entrando…" : "Entrar na sala"}<ArrowRight size={17} /></button>
            <small>Seu nome fica salvo apenas neste navegador.</small>
          </form>
        </div>
      )}
    </main>
  );
}
