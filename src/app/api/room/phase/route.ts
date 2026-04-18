import { NextRequest, NextResponse } from "next/server";
import { getRoom, setPhase } from "@/lib/rooms";
import { pushState } from "@/lib/pusher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["lobby", "genre", "difficulty", "playing", "ended"]);

export async function POST(req: NextRequest) {
  try {
    const { code, phase, playerId } = await req.json();
    if (!code || !ALLOWED.has(phase))
      return NextResponse.json({ error: "code + valid phase required" }, { status: 400 });
    const upper = String(code).toUpperCase();
    const r0 = await getRoom(upper);
    if (!r0) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (r0.hostId !== playerId)
      return NextResponse.json({ error: "Only host can change phase" }, { status: 403 });
    const room = await setPhase(upper, phase);
    if (room) await pushState(room.code, room);
    return NextResponse.json({ room });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
