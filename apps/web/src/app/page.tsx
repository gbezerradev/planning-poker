"use client";

import { ArrowRight, Copy, LockKeyhole, Plus, Sparkles, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

function normalizeCode(value: string) {
  const clean = value.trim().replace(/\/$/, "");
  return clean.split("/").pop()?.toLowerCase() ?? "";
}

export default function Home() {
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [creating, setCreating] = useState(false);

  const createNewRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!roomName.trim() || !creatorName.trim()) return;
    setCreating(true);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName }),
      });
      if (!response.ok) throw new Error("Não foi possível criar a sala");
      const data = (await response.json()) as { code: string };
      localStorage.setItem("ponto_name", creatorName.trim());
      router.push(`/room/${data.code}`);
    } catch {
      toast.error("Não foi possível criar a sala. Verifique o PostgreSQL.");
      setCreating(false);
    }
  };

  const joinRoom = (event: React.FormEvent) => {
    event.preventDefault();
    const code = normalizeCode(roomCode);
    if (code) router.push(`/room/${code}`);
  };

  return (
    <main className="landing-shell">
      <header className="landing-nav">
        <a className="brand landing-brand" href="/">
          <span className="brand-mark"><Sparkles size={18} strokeWidth={2.4} /></span>
          <span>PONTO</span>
        </a>
        <span className="private-pill"><LockKeyhole size={14} /> Salas privadas por link</span>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <span className="hero-kicker"><i /> PLANNING POKER COLABORATIVO</span>
          <h1>Decidam juntos.<br /><em>Sem ruído.</em></h1>
          <p>Crie uma mesa privada, compartilhe o link com o time e revele as estimativas ao mesmo tempo.</p>
          <div className="hero-points">
            <span><b>01</b> Crie a sala</span>
            <i />
            <span><b>02</b> Compartilhe</span>
            <i />
            <span><b>03</b> Votem juntos</span>
          </div>
        </div>

        <div className="room-creator">
          <div className="creator-tabs">
            <span className="is-active"><Plus size={14} /> Nova sala</span>
            <span><Users size={14} /> Sem cadastro</span>
          </div>
          <form onSubmit={createNewRoom}>
            <span className="eyebrow">COMEÇAR UMA SESSÃO</span>
            <h2>Prepare a mesa</h2>
            <label htmlFor="room-name">Nome da sala</label>
            <input id="room-name" maxLength={60} value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Ex.: Refinamento Sprint 24" />
            <label htmlFor="creator-name">Seu nome</label>
            <input id="creator-name" maxLength={40} value={creatorName} onChange={(event) => setCreatorName(event.target.value)} placeholder="Como o time vai te identificar?" />
            <button type="submit" disabled={!roomName.trim() || !creatorName.trim() || creating}>
              {creating ? "Criando sala…" : "Criar sala privada"}<ArrowRight size={17} />
            </button>
          </form>

          <div className="join-divider"><span />ou entre em uma sala existente<span /></div>
          <form className="code-form" onSubmit={joinRoom}>
            <div><Copy size={16} /><input aria-label="Código ou link da sala" value={roomCode} onChange={(event) => setRoomCode(event.target.value)} placeholder="Cole o link ou código da sala" /></div>
            <button type="submit" disabled={!normalizeCode(roomCode)}>Entrar</button>
          </form>
          <small className="creator-note"><LockKeyhole size={12} /> Somente quem receber o link consegue acessar a mesa.</small>
        </div>
      </section>

      <div className="landing-table-art" aria-hidden="true">
        <span className="art-card">3</span><span className="art-card">5</span><span className="art-card is-accent">8</span><span className="art-card">13</span>
      </div>
    </main>
  );
}
