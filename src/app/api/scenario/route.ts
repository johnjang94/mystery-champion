import { NextRequest, NextResponse } from "next/server";
import { generateScenario } from "@/lib/openai";
import { getRoom, setDifficulty, setGenre, setScenario } from "@/lib/rooms";
import { pushState } from "@/lib/pusher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { code, genre, difficulty, playerId } = await req.json();
    if (!code || !genre || !difficulty)
      return NextResponse.json({ error: "code + genre + difficulty required" }, { status: 400 });
    const upper = String(code).toUpperCase();
    const r0 = await getRoom(upper);
    if (!r0) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (r0.hostId !== playerId)
      return NextResponse.json({ error: "Only host can start" }, { status: 403 });

    await setGenre(upper, genre);
    await setDifficulty(upper, difficulty);

    // Text-only — images are generated per-photo via /api/room/image after this returns.
    const scenario = await generateScenario(genre, difficulty);

    const room = await setScenario(upper, scenario);
    if (room) await pushState(room.code, room);
    return NextResponse.json({ room });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
