"use client";

import {
  ArrowRight,
  Check,
  ChevronDown,
  Coffee,
  Copy,
  Ellipsis,
  Plus,
  RotateCcw,
  Sparkles,
  Timer,
  Users,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const DECK = ["0", "1", "2", "3", "5", "8", "13", "21", "?", "☕"];
const ROOM_CODE = "aurora";

type Story = {
  id: number;
  key: string;
  title: string;
  description: string;
  tag: string;
  position: number;
  estimate: number | null;
};

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
  room: { code: string; name: string; revealed: boolean; round: number; activeStoryId: number | null };
  stories: Story[];
  participants: Participant[];
  result: { average: number; agreement: number; votedCount: number };
};

const FALLBACK_STORY: Story = {
  id: 0,
  key: "PP-241",
  title: "Novo fluxo de checkout em uma página",
  description: "Como cliente, quero concluir minha compra sem trocar de página para reduzir o abandono no carrinho.",
  tag: "Produto",
  position: 0,
  estimate: null,
};

export default function Home() {
  const [room, setRoom] = useState<RoomPayload | null>(null);
  const [participantId, setParticipantId] = useState("");
  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const loadRoom = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/rooms/${ROOM_CODE}?participantId=${encodeURIComponent(id)}`, { cache: "no-store" });
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
  }, []);

  const sendAction = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch(`/api/rooms/${ROOM_CODE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, participantId }),
    });
    if (!response.ok) throw new Error("Não foi possível atualizar a sala");
    await loadRoom(participantId);
  }, [loadRoom, participantId]);

  useEffect(() => {
    let id = localStorage.getItem("ponto_participant_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("ponto_participant_id", id);
    }
    const savedName = localStorage.getItem("ponto_name") ?? "";
    setParticipantId(id);
    setName(savedName);
    setNameInput(savedName);
    if (savedName) {
      fetch(`/api/rooms/${ROOM_CODE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", participantId: id, name: savedName }),
      }).then(() => loadRoom(id));
    } else {
      setLoading(false);
    }
  }, [loadRoom]);

  useEffect(() => {
    if (!participantId || !name) return;
    const interval = window.setInterval(() => loadRoom(participantId), 2000);
    return () => window.clearInterval(interval);
  }, [loadRoom, name, participantId]);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  const reveal = useCallback(async () => {
    if (!selected) {
      toast.error("Escolha uma carta antes de revelar os votos.");
      return;
    }
    await sendAction({ action: "reveal" });
  }, [selected, sendAction]);

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

  const acceptEstimate = async () => {
    const fibonacci = [0, 1, 2, 3, 5, 8, 13, 21];
    const estimate = fibonacci.find((value) => value >= (room?.result.average ?? 0)) ?? 21;
    await sendAction({ action: "accept", estimate });
    setSelected(null);
    toast.success(`${estimate} pontos registrados`);
  };

  const activateStory = async (storyId: number) => {
    if (storyId === room?.room.activeStoryId) return;
    setSelected(null);
    await sendAction({ action: "activate", storyId });
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success("Link da sala copiado!");
  };

  const activeStory = room?.stories.find((story) => story.id === room.room.activeStoryId) ?? room?.stories[0] ?? FALLBACK_STORY;
  const completed = room?.stories.filter((story) => story.estimate !== null).length ?? 0;
  const progress = room?.stories.length ? Math.round((completed / room.stories.length) * 100) : 0;
  const me = room?.participants.find((participant) => participant.id === participantId);
  const seats = useMemo(() => {
    const participants = room?.participants.slice(0, 5) ?? [];
    return [...participants, ...Array.from({ length: Math.max(0, 5 - participants.length) }, (_, index) => ({
      id: `empty-${index}`,
      name: "Aguardando",
      initials: "+",
      role: "Lugar livre",
      color: "empty",
      voted: false,
      vote: null,
    }))];
  }, [room?.participants]);
  const timerLabel = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Ponto home">
          <span className="brand-mark"><Sparkles size={18} strokeWidth={2.4} /></span>
          <span>PONTO</span>
        </a>
        <div className="room-identity">
          <span className={`live-dot ${connectionError ? "is-offline" : ""}`} />
          <div><strong>{room?.room.name ?? "Sprint Aurora"}</strong><small>Sala #{ROOM_CODE}</small></div>
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
        <aside className="story-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">BACKLOG</span><h2>Histórias da rodada</h2></div>
            <button className="icon-button" aria-label="Adicionar história"><Plus size={18} /></button>
          </div>
          <div className="progress-copy"><span>{completed} de {room?.stories.length ?? 4} estimadas</span><strong>{progress}%</strong></div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <div className="story-list">
            {(room?.stories ?? [FALLBACK_STORY]).map((story, index) => (
              <button key={story.id} className={`story-item ${story.id === activeStory.id ? "is-active" : ""}`} onClick={() => activateStory(story.id)}>
                <span className="story-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="story-copy">
                  <span className="story-meta"><b>{story.key}</b><i>{story.tag}</i></span>
                  <strong>{story.title}</strong>
                </span>
                {story.estimate !== null ? <span className="estimate-badge">{story.estimate}</span> : <ArrowRight className="story-arrow" size={17} />}
              </button>
            ))}
          </div>
          <div className="session-note">
            <span className="note-icon"><Users size={18} /></span>
            <div><strong>{room?.participants.length ?? 0} {room?.participants.length === 1 ? "pessoa" : "pessoas"} na sala</strong><small>Sincronização automática</small></div>
            <span className="online-stack"><i /><i /><i /></span>
          </div>
        </aside>

        <section className="game-area">
          <div className="story-header">
            <div>
              <span className="story-code"><i />{activeStory.key}<em>{activeStory.tag}</em></span>
              <h1>{activeStory.title}</h1>
              <p>{activeStory.description}</p>
            </div>
            <button className="icon-button story-menu" aria-label="Mais opções"><Ellipsis size={20} /></button>
          </div>

          <div className={`poker-table ${room?.room.revealed ? "is-revealed" : ""}`}>
            <div className="table-orbit" />
            <div className="table-center">
              {room?.room.revealed ? (
                <>
                  <span className="result-kicker"><Sparkles size={15} /> VOTOS REVELADOS</span>
                  <strong className="average-number">{room.result.average}</strong>
                  <span className="average-label">média da rodada</span>
                  <div className="agreement"><span style={{ width: `${room.result.agreement}%` }} /><b>{room.result.agreement}% acordo</b></div>
                </>
              ) : (
                <>
                  <span className="waiting-icon"><span /><span /><span /></span>
                  <strong>{room?.result.votedCount ?? 0} de {room?.participants.length ?? 0} votaram</strong>
                  <small>Os votos ficam ocultos até a revelação</small>
                  <button className="reveal-button" onClick={reveal}>Revelar cartas <Sparkles size={16} /></button>
                </>
              )}
            </div>

            <div className="players-grid">
              {seats.map((participant) => (
                <div className="player" key={participant.id}>
                  <div className={`vote-card ${participant.voted ? "has-vote" : ""} ${room?.room.revealed && participant.vote ? "show-value" : ""}`}>
                    {room?.room.revealed && participant.vote ? <b>{participant.vote}</b> : participant.voted ? <span className="card-pattern">P</span> : <span className="waiting-mark">•••</span>}
                  </div>
                  <div className={`avatar avatar-${participant.color}`}>{participant.initials}</div>
                  <div className="player-copy"><strong>{participant.name}{participant.id === participantId && <em>você</em>}</strong><small>{participant.role}</small></div>
                  {participant.voted && <span className="voted-check"><Check size={11} /></span>}
                </div>
              ))}
            </div>
          </div>

          {room?.room.revealed && (
            <div className="round-actions">
              <button className="secondary-action" onClick={resetRound}><RotateCcw size={16} /> Nova votação</button>
              <button className="primary-action" onClick={acceptEstimate}><Check size={16} /> Aceitar estimativa</button>
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
        </section>
      </div>

      {!name && !loading && (
        <div className="join-overlay">
          <form className="join-card" onSubmit={join}>
            <span className="join-mark"><Sparkles size={21} /></span>
            <span className="eyebrow">SALA #{ROOM_CODE.toUpperCase()}</span>
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
