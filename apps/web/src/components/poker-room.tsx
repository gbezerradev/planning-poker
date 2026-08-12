"use client";

import {
  ArrowRight,
  Check,
  ChevronDown,
  Coffee,
  Copy,
  ListPlus,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  StickyNote,
  Timer,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const DECK = ["0", "1", "2", "3", "5", "8", "13", "21", "?", "☕"];

type Story = {
  id: number;
  key: string;
  title: string;
  description: string;
  notes: string;
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

const EMPTY_STORY: Story = {
  id: 0,
  key: "",
  title: "",
  description: "",
  notes: "",
  tag: "",
  position: 0,
  estimate: null,
};

export default function PokerRoom({ roomCode }: { roomCode: string }) {
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
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [addingStory, setAddingStory] = useState(false);
  const [newStory, setNewStory] = useState({ key: "", title: "", description: "", tag: "Produto" });

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
      body: JSON.stringify({ ...payload, participantId }),
    });
    if (!response.ok) throw new Error("Não foi possível atualizar a sala");
    await loadRoom(participantId);
  }, [loadRoom, participantId, roomCode]);

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
      fetch(`/api/rooms/${roomCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", participantId: id, name: savedName }),
      }).then(() => loadRoom(id));
    } else {
      setLoading(false);
    }
  }, [loadRoom, roomCode]);

  useEffect(() => {
    if (!participantId || !name) return;
    const interval = window.setInterval(() => loadRoom(participantId), 2000);
    return () => window.clearInterval(interval);
  }, [loadRoom, name, participantId]);

  useEffect(() => {
    if (!participantId || !name) return;
    const leaveRoom = () => {
      const body = JSON.stringify({ action: "leave", participantId });
      navigator.sendBeacon(`/api/rooms/${roomCode}`, new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("pagehide", leaveRoom);
    return () => window.removeEventListener("pagehide", leaveRoom);
  }, [name, participantId, roomCode]);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  const reveal = useCallback(async () => {
    if (activeStory.estimate !== null) return;
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
    if (room?.room.revealed || activeStory.estimate !== null) return;
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

  const addStory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newStory.title.trim()) return;
    setAddingStory(true);
    try {
      await sendAction({ action: "addStory", ...newStory });
      setNewStory({ key: "", title: "", description: "", tag: "Produto" });
      setBacklogOpen(false);
      toast.success("História adicionada ao backlog");
    } catch {
      toast.error("Não foi possível adicionar a história.");
    } finally {
      setAddingStory(false);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await sendAction({ action: "updateNotes", storyId: activeStory.id, notes: noteDraft });
      toast.success("Notas salvas");
    } catch {
      toast.error("Não foi possível salvar as notas.");
    } finally {
      setSavingNotes(false);
    }
  };

  const hasStories = Boolean(room?.stories.length);
  const activeStory = room?.stories.find((story) => story.id === room.room.activeStoryId) ?? room?.stories[0] ?? EMPTY_STORY;
  const storyCompleted = activeStory.estimate !== null;
  useEffect(() => {
    setNoteDraft(activeStory.notes ?? "");
  }, [activeStory.id, activeStory.notes]);
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
        <aside className="story-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">BACKLOG</span><h2>Histórias da rodada</h2></div>
            <button className="icon-button" aria-label="Adicionar história" onClick={() => setBacklogOpen(true)}><Plus size={18} /></button>
          </div>
          <div className="progress-copy"><span>{completed} de {room?.stories.length ?? 0} estimadas</span><strong>{progress}%</strong></div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <div className="story-list">
            {(room?.stories ?? []).map((story, index) => (
              <button key={story.id} className={`story-item ${story.id === activeStory.id ? "is-active" : ""}`} onClick={() => activateStory(story.id)}>
                <span className="story-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="story-copy">
                  <span className="story-meta"><b>{story.key}</b><i>{story.tag}</i></span>
                  <strong>{story.title}</strong>
                </span>
                {story.estimate !== null ? <span className="estimate-badge">{story.estimate}</span> : <ArrowRight className="story-arrow" size={17} />}
              </button>
            ))}
            {room && !hasStories && (
              <div className="backlog-empty">
                <span><ListPlus size={18} /></span>
                <strong>Seu backlog está vazio</strong>
                <p>Comece pela história que o time vai estimar.</p>
                <button onClick={() => setBacklogOpen(true)}><Plus size={14} /> Adicionar história</button>
              </div>
            )}
          </div>
          <div className="session-note">
            <span className="note-icon"><Users size={18} /></span>
            <div><strong>{room?.participants.length ?? 0} {room?.participants.length === 1 ? "pessoa" : "pessoas"} na sala</strong><small>Sincronização automática</small></div>
            <span className="online-stack"><i /><i /><i /></span>
          </div>
        </aside>

        <section className="game-area">
          {room && !hasStories && (
            <div className="room-onboarding">
              <div className="onboarding-content">
                <span className="onboarding-kicker"><Sparkles size={14} /> {me?.role === "Facilitador" ? "VOCÊ É O FACILITADOR" : "SALA PRONTA"}</span>
                <h1>{me?.role === "Facilitador" ? `Sala pronta, ${name.split(/\s+/)[0]}.` : "A sala está pronta."}</h1>
                <p>Comece adicionando o primeiro item que o time vai estimar. Leva menos de um minuto.</p>

                <div className="onboarding-steps" aria-label="Como começar">
                  <div className="is-current"><span>1</span><div><strong>Crie a primeira história</strong><small>Título, contexto e categoria.</small></div></div>
                  <div><span>2</span><div><strong>Compartilhe a sala</strong><small>Envie o link privado para o time.</small></div></div>
                  <div><span>3</span><div><strong>Estimem juntos</strong><small>Votem, revelem e salvem o resultado.</small></div></div>
                </div>

                <div className="onboarding-actions">
                  <button className="onboarding-primary" onClick={() => setBacklogOpen(true)}><Plus size={17} /> Criar primeira história</button>
                  <button className="onboarding-secondary" onClick={copyInvite}><Copy size={16} /> Copiar convite</button>
                </div>
              </div>

              <div className="onboarding-visual" aria-hidden="true">
                <div className="onboarding-table">
                  <span className="preview-card preview-card-one">3</span>
                  <span className="preview-card preview-card-two">5</span>
                  <span className="preview-card preview-card-three">8</span>
                  <div className="table-empty-state">
                    <span><ListPlus size={19} /></span>
                    <strong>Primeira história</strong>
                    <small>entra aqui</small>
                  </div>
                </div>
                <span className="visual-caption"><i /> Mesa pronta para o time</span>
              </div>
            </div>
          )}

          <div className={`game-content ${!hasStories ? "is-hidden" : ""}`}>
          <div className="story-header">
            <div>
              <span className="story-code"><i />{activeStory.key}<em>{activeStory.tag}</em></span>
              <h1>{activeStory.title}</h1>
              <p>{activeStory.description}</p>
            </div>
            <button className={`notes-toggle ${notesOpen ? "is-active" : ""}`} aria-label="Abrir notas da história" onClick={() => setNotesOpen(!notesOpen)}>
              <StickyNote size={17} /> Notas {activeStory.notes && <i />}
            </button>
          </div>

          {notesOpen && (
            <div className="story-notes">
              <div className="notes-heading">
                <div><StickyNote size={16} /><span><b>Notas da história</b><small>Contexto compartilhado com toda a equipe</small></span></div>
                <button aria-label="Fechar notas" onClick={() => setNotesOpen(false)}><X size={16} /></button>
              </div>
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                maxLength={5000}
                placeholder="Registre dúvidas, dependências, riscos ou decisões importantes…"
              />
              <div className="notes-footer">
                <span>{noteDraft.length}/5000</span>
                <button onClick={saveNotes} disabled={savingNotes || noteDraft === activeStory.notes}><Save size={14} />{savingNotes ? "Salvando…" : "Salvar notas"}</button>
              </div>
            </div>
          )}

          <div className={`poker-table ${room?.room.revealed ? "is-revealed" : ""} ${storyCompleted ? "is-complete" : ""}`}>
            <div className="table-orbit" />
            <div className="table-center">
              {storyCompleted ? (
                <>
                  <span className="completed-mark"><Check size={20} /></span>
                  <span className="result-kicker">ESTIMATIVA ACEITA</span>
                  <strong className="average-number">{activeStory.estimate}</strong>
                  <span className="average-label">pontos registrados</span>
                </>
              ) : room?.room.revealed ? (
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

          {room?.room.revealed && !storyCompleted && (
            <div className="round-actions">
              <button className="secondary-action" onClick={resetRound}><RotateCcw size={16} /> Nova votação</button>
              <button className="primary-action" onClick={acceptEstimate}><Check size={16} /> Aceitar estimativa</button>
            </div>
          )}

          {storyCompleted ? (
            <div className="estimate-locked">
              <span><Check size={18} /></span>
              <div><span className="eyebrow">HISTÓRIA CONCLUÍDA</span><h2>Estimativa encerrada</h2><p>Selecione outra história pendente no backlog ou adicione um novo item.</p></div>
            </div>
          ) : (
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
          )}
          </div>
        </section>
      </div>

      {backlogOpen && (
        <div className="backlog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBacklogOpen(false); }}>
          <form className="backlog-modal" onSubmit={addStory}>
            <div className="modal-heading">
              <span className="modal-mark"><Plus size={20} /></span>
              <div><span className="eyebrow">NOVA HISTÓRIA</span><h2>Adicionar ao backlog</h2></div>
              <button type="button" aria-label="Fechar" onClick={() => setBacklogOpen(false)}><X size={18} /></button>
            </div>
            <div className="form-row">
              <label><span>Identificador <i>opcional</i></span><input value={newStory.key} onChange={(event) => setNewStory({ ...newStory, key: event.target.value })} maxLength={20} placeholder="PP-243" /></label>
              <label><span>Categoria</span><select value={newStory.tag} onChange={(event) => setNewStory({ ...newStory, tag: event.target.value })}><option>Produto</option><option>Engenharia</option><option>Design</option><option>Segurança</option><option>Analytics</option></select></label>
            </div>
            <label><span>Título da história</span><input autoFocus required value={newStory.title} onChange={(event) => setNewStory({ ...newStory, title: event.target.value })} maxLength={140} placeholder="Ex.: Permitir exportar relatório em CSV" /></label>
            <label><span>Descrição</span><textarea value={newStory.description} onChange={(event) => setNewStory({ ...newStory, description: event.target.value })} maxLength={1200} placeholder="Como usuário, quero…" /></label>
            <div className="modal-actions">
              <button type="button" onClick={() => setBacklogOpen(false)}>Cancelar</button>
              <button type="submit" disabled={!newStory.title.trim() || addingStory}>{addingStory ? "Adicionando…" : "Adicionar história"}<ArrowRight size={16} /></button>
            </div>
          </form>
        </div>
      )}

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
