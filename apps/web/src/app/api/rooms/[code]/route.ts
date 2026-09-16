import { NextResponse } from "next/server";
import { applyRoomAction, getRoomState, RoomActionError } from "@/lib/room";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const url = new URL(request.url);
    const participantId = url.searchParams.get("participantId");
    const participantToken = request.headers.get("x-participant-token");
    return NextResponse.json(await getRoomState(code, participantId, participantToken));
  } catch (error) {
    const status = error instanceof RoomActionError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar a sala" }, { status });
  }
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ error: "O corpo da requisição deve ser um objeto JSON" }, { status: 400 });
    }
    const result = await applyRoomAction(code, input as Record<string, unknown>);
    return NextResponse.json({ ok: true, ...(result ?? {}) });
  } catch (error) {
    const status = error instanceof RoomActionError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar a sala" }, { status });
  }
}
