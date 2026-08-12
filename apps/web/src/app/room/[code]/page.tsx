import PokerRoom from "@/components/poker-room";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sala de planning poker — PONTO",
};

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PokerRoom roomCode={decodeURIComponent(code).toLowerCase()} />;
}
