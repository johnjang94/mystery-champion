import { NextRequest, NextResponse } from "next/server";
import { endGame, findPlayer, getRoom, pushActivity } from "@/lib/rooms";
import { pushPlayerEvent, pushState, pushTeamEvent } from "@/lib/pusher";
import { judgeAnswer } from "@/lib/openai";
import { buttonsActive, derivePhase } from "@/lib/phase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { code, playerId, answer } = await req.json();
    if (!code || !playerId || !answer)
      return NextResponse.json({ error: "code/playerId/answer required" }, { status: 400 });
    const upper = String(code).toUpperCase();
    const r = await getRoom(upper);
    if (!r || !r.scenario)
      return NextResponse.json({ error: "Game not active" }, { status: 400 });
    if (!buttonsActive(r))
      return NextResponse.json({ error: "Buttons are not active yet" }, { status: 400 });

    const me = findPlayer(r, playerId);
    if (!me) return NextResponse.json({ error: "Not in room" }, { status: 403 });

    const { revealedBonus } = derivePhase(r);
    const j = await judgeAnswer(r.scenario, answer, revealedBonus);

    const payload = { askerName: me.name, answer, verdict: j.verdict, message: j.message };
    if (r.mode === "solo") {
      await pushPlayerEvent(upper, playerId, "answer-result", payload);
    } else if (me.team != null) {
      await pushTeamEvent(upper, me.team, "answer-result", payload);
    }

    if (j.verdict === "correct") {
      await pushActivity(upper, `${me.name} solved the case!`);
      const winner = r.mode === "solo" ? playerId : (me.team as 0 | 1);
      const final = await endGame(upper, winner);
      if (final) await pushState(upper, final);
    } else {
      const r2 = await pushActivity(upper, `${me.name} attempted an answer.`);
      if (r2) await pushState(upper, r2);
    }
    return NextResponse.json({ verdict: j.verdict });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
