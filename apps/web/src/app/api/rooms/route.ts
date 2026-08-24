import { NextResponse } from "next/server";
import { createRoom } from "@/lib/room";

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const name = String(input.name ?? "Nova sala").trim().slice(0, 60) || "Nova sala";
    const room = await createRoom(name);
    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar sala" },
      { status: 500 }
    );
  }
}
