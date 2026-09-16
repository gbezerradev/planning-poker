import { NextResponse } from "next/server";
import { createRoom } from "@/lib/room";

export async function POST(request: Request) {
  try {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ error: "O corpo da requisição deve ser um objeto JSON" }, { status: 400 });
    }
    const body = input as Record<string, unknown>;
    const name = String(body.name ?? "Nova sala").trim().slice(0, 60) || "Nova sala";
    const room = await createRoom(name);
    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar sala" },
      { status: 500 }
    );
  }
}
