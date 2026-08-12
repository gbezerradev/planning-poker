import { applyRoomAction, getRoomState } from "@/lib/room";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const participantId = new URL(request.url).searchParams.get("participantId");
    return NextResponse.json(await getRoomState(code, participantId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar a sala" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const input = await request.json();
    await applyRoomAction(code, input);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar a sala" }, { status: 500 });
  }
}
