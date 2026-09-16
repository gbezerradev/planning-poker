import PokerRoom from "@/components/poker-room";
import { normalizeRoomCode, roomExists } from "@/lib/room";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sala de planning poker — POKER",
};

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalizedCode = normalizeRoomCode(decodeURIComponent(code));
  if (!roomExists(normalizedCode)) notFound();
  return <PokerRoom roomCode={normalizedCode} />;
}
