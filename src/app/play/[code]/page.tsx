"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { api, apiGet, getPlayerId, speakOpenAI, subscribeRoom } from "@/lib/client";
import { derivePhase, fmt, type TimerDisplay } from "@/lib/phase";
import type { RoomState } from "@/types/game";

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.5 },
};

type Hint = { askerName: string; question: string; hint: string };
type AnswerResult = {
  askerName: string;
  answer: string;
  verdict: "correct" | "not_true" | "unknown";
  message: string;
};

export default function PlayPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code || "").toUpperCase();
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<Hint[]>([]);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [questionDraft, setQuestionDraft] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");
  const announcedRef = useRef<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());
  const [exitOpen, setExitOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Pre-fetch the current room state so the player can see who's there.
  // Also auto-rejoin if this player's ID is already in the room (e.g. after
  // accidentally navigating away mid-game).
  useEffect(() => {
    apiGet<{ room: RoomState }>(`/api/room/${code}`)
      .then((r) => {
        setRoom(r.room);
        const playerId = getPlayerId();
        const alreadyIn = r.room.players.some((p) => p.id === playerId);
        if (alreadyIn) setJoined(true);
      })
      .catch(() => {});
  }, [code]);

  // Subscribe (after join) for state + hints + answer results.
  // IMPORTANT: depend on the player's team value too — when the host forms
  // teams, the player's team flips from null → 0/1 and we need to (re)subscribe
  // to the team channel so hints + answer results actually arrive.
  const myPlayerId = typeof window !== "undefined" ? getPlayerId() : "";
  const myTeamValue = room?.players.find((p) => p.id === myPlayerId)?.team ?? null;
  useEffect(() => {
    if (!joined || !room) return;
    const playerId = getPlayerId();
    const subs = subscribeRoom(code, myTeamValue, playerId, {
      onState: setRoom,
      onHint: (h) => setHints((arr) => [h, ...arr].slice(0, 20)),
      onAnswerResult: (r) => setResults((arr) => [r, ...arr].slice(0, 20)),
    });
    return () => subs.unsubscribe();
  }, [joined, code, myTeamValue, room?.mode]);

  // Voice announcements (keyed by timer.kind so they fire exactly once per transition)
  useEffect(() => {
    if (!room || !joined) return;
    if (room.storedPhase !== "playing") return;
    const d = derivePhase(room, now);
    const key = d.timer.kind + (d.timer.kind === "bonus_reveal" ? String(d.timer.nth) : "");
    if (announcedRef.current.has(key)) return;
    announcedRef.current.add(key);
    if (d.timer.kind === "thinking") speakOpenAI("Five minute countdown begins now.");
    if (d.timer.kind === "next_keyword" && d.timer.nth === 1)
      speakOpenAI("You may now ask questions and attempt answers.");
    if (d.timer.kind === "bonus_reveal" && d.timer.nth === 1)
      speakOpenAI(`An additional keyword is now revealed: ${d.timer.keyword}.`);
    if (d.timer.kind === "bonus_reveal" && d.timer.nth === 2)
      speakOpenAI(`The final keyword is now revealed: ${d.timer.keyword}.`);
  }, [room, joined, now]);

  if (!joined) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <Link href="/" className="absolute top-6 left-6 text-parchment/60 text-sm">← Home</Link>
        <h2 className="text-3xl text-accent font-display">Join Room</h2>
        <div className="mt-2 text-accent text-2xl tracking-[0.4em]">{code}</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="mt-8 bg-parchment/10 rounded px-4 py-3 text-parchment outline-none border border-parchment/15 w-64"
        />
        {error && <div className="mt-3 text-crimson text-sm">{error}</div>}
        <button
          onClick={async () => {
            try {
              const { room: r } = await api<{ room: RoomState }>("/api/room/join", { code, name });
              setRoom(r);
              setJoined(true);
            } catch (e: any) {
              setError(String(e?.message || e));
            }
          }}
          disabled={!name.trim()}
          className="mt-6 btn-primary disabled:opacity-40"
        >
          Join
        </button>
      </main>
    );
  }

  if (!room) return <main className="min-h-screen flex items-center justify-center text-parchment/60">Connecting…</main>;

  const playerId = getPlayerId();
  const me = room.players.find((p) => p.id === playerId);
  const myTeam = me?.team;
  const d = derivePhase(room, now);
  const buttonsActive = d.buttonsUnlocked;

  return (
    <div className="min-h-screen w-full px-5 py-6">
      <AnimatePresence mode="wait">
        {room.storedPhase === "lobby" && (
          <motion.section key="lobby" {...fade} className="mt-12 text-center">
            <div className="text-parchment/60 text-xs uppercase tracking-widest">Waiting for host</div>
            <div className="mt-2 text-2xl text-accent">{room.players.length} players in room</div>
            <ul className="mt-6 space-y-1 text-parchment/80">
              {room.players.map((p) => <li key={p.id}>{p.name}</li>)}
            </ul>
          </motion.section>
        )}

        {room.storedPhase === "genre" && (
          <motion.section key="genre" {...fade} className="mt-12 text-center">
            <div className="text-parchment/60 text-xs uppercase tracking-widest">
              {room.mode === "solo" ? "Solo mode" : "Group mode"}
            </div>
            <div className="mt-2 text-4xl text-accent font-display">
              {room.mode === "solo" ? me?.name || "Player" : `Team ${myTeam == null ? "?" : myTeam + 1}`}
            </div>
            <p className="mt-4 text-parchment/70">Wait for the host to choose the game type.</p>
          </motion.section>
        )}

        {room.storedPhase === "difficulty" && (
          <motion.section key="difficulty" {...fade} className="mt-12 text-center">
            <div className="text-parchment/70">The host is choosing the difficulty…</div>
          </motion.section>
        )}

        {(room.storedPhase === "playing" || room.storedPhase === "ended") && (
          <motion.section key="game" {...fade} className="mt-2 pb-20">
            {/* Mini timer for phones */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-parchment/50 text-sm">
                {room.mode === "solo" ? me?.name || "Player" : `Team ${myTeam == null ? "?" : myTeam + 1}`}
                {" · "}
                <span className="text-parchment/70">
                  {room.mode === "solo" ? me?.score : (myTeam != null ? room.scores[myTeam] : "")} pts
                </span>
              </div>
              <PlayerTimerBadge timer={d.timer} />
            </div>

            {/* Bonus keyword badge */}
            {d.revealedBonus > 0 && room.scenario && (
              <div className="card mb-3 border-accent/50">
                <div className="text-accent text-[10px] uppercase tracking-widest">
                  {d.timer.kind === "bonus_reveal" && d.timer.nth === 1 ? "Bonus keyword revealed!" :
                   d.timer.kind === "bonus_reveal" && d.timer.nth === 2 ? "Final keyword revealed!" :
                   "Bonus keywords"}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {room.scenario.bonusKeywords.slice(0, d.revealedBonus).map((k) => (
                    <span key={k} className="px-3 py-1 rounded-full bg-accent text-ink text-sm font-semibold">{k}</span>
                  ))}
                </div>
              </div>
            )}

            {room.scenario && (
              <div className="card mt-4">
                <div className="flex flex-wrap gap-2">
                  {room.genre && (
                    <span className="px-2 py-1 rounded-full bg-accent text-ink text-[10px] uppercase tracking-widest">
                      {room.genre}
                    </span>
                  )}
                  {room.difficulty && (
                    <span className="px-2 py-1 rounded-full border border-accent/35 text-accent text-[10px] uppercase tracking-widest">
                      {room.difficulty}
                    </span>
                  )}
                </div>
                <div className="text-accent text-[10px] uppercase tracking-widest">Briefing</div>
                <p className="mt-1 text-parchment/90 text-sm italic">{room.scenario.briefing}</p>
                <p className="mt-2 text-parchment/80 text-sm">{room.scenario.question}</p>
                {room.genre === "Visual Match" && (
                  <p className="mt-2 text-parchment/60 text-xs">
                    Match the OpenAI-generated 3D maze scene to the labeled 2D maze board.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {room.scenario.photos.map((p) => (
                    <span key={p.keyword} className="px-2 py-1 rounded bg-accent/15 border border-accent/40 text-accent text-xs">
                      {p.keyword}
                    </span>
                  ))}
                  {room.scenario.bonusKeywords.slice(0, d.revealedBonus).map((k) => (
                    <span key={k} className="px-2 py-1 rounded bg-crimson/20 border border-crimson text-parchment text-xs">
                      {k} ★
                    </span>
                  ))}
                </div>
                {room.scenario.choices?.length ? (
                  <div className="mt-3 space-y-2">
                    <div className="text-accent text-[10px] uppercase tracking-widest">Possible answers</div>
                    {room.scenario.choices.map((choice) => (
                      <div key={choice} className="rounded-md border border-parchment/10 bg-parchment/5 px-3 py-2 text-sm text-parchment/80">
                        {choice}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            <div className="mt-4 card">
              <div className="text-accent text-[10px] uppercase tracking-widest">Ask a question</div>
              <textarea
                value={questionDraft}
                onChange={(e) => setQuestionDraft(e.target.value)}
                disabled={!buttonsActive}
                rows={2}
                className="mt-2 w-full bg-parchment/10 rounded px-3 py-2 text-parchment text-sm outline-none border border-parchment/15 disabled:opacity-50"
                placeholder="What would you like to know?"
              />
              <button
                disabled={!buttonsActive || !questionDraft.trim()}
                onClick={async () => {
                  try {
                    await api("/api/game/question", { code, question: questionDraft });
                    setQuestionDraft("");
                  } catch (e: any) {
                    setError(String(e?.message || e));
                  }
                }}
                className="mt-2 btn-pill disabled:opacity-40"
              >
                Ask question (-1 pt)
              </button>
            </div>

            <div className="mt-4 card">
              <div className="text-accent text-[10px] uppercase tracking-widest">Attempt an answer</div>
              <div className="mt-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-[11px] text-parchment/80 leading-relaxed">
                <div className="text-accent text-[10px] uppercase tracking-widest mb-1">How to answer</div>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Give your best answer using the passage, clues, and any revealed keywords.</li>
                  <li>For number-to-letter and guess rounds, compare your answer with the choices carefully.</li>
                  <li>For visual-match rounds, use the labeled maze to support your call.</li>
                </ul>
              </div>
              <textarea
                value={answerDraft}
                onChange={(e) => setAnswerDraft(e.target.value)}
                disabled={!buttonsActive}
                rows={3}
                className="mt-2 w-full bg-parchment/10 rounded px-3 py-2 text-parchment text-sm outline-none border border-parchment/15 disabled:opacity-50"
                placeholder="Type the answer you want to submit"
              />
              <button
                disabled={!buttonsActive || !answerDraft.trim()}
                onClick={async () => {
                  try {
                    await api("/api/game/answer", { code, answer: answerDraft });
                    setAnswerDraft("");
                  } catch (e: any) {
                    setError(String(e?.message || e));
                  }
                }}
                className="mt-2 btn-primary !py-2 !px-4 disabled:opacity-40"
              >
                Attempt answer
              </button>
            </div>

            <div className="mt-4 card max-h-64 overflow-auto">
              <div className="text-accent text-[10px] uppercase tracking-widest">
                {room.mode === "solo" ? "Your feed" : "Team feed"}
              </div>
              <ul className="mt-2 text-sm space-y-2">
                {results.map((r, i) => (
                  <li
                    key={"r" + i}
                    className={
                      r.verdict === "correct"
                        ? "text-emerald-400"
                        : r.verdict === "not_true"
                        ? "text-crimson"
                        : "text-parchment/70"
                    }
                  >
                    <b>{r.askerName}:</b> {r.answer} → {r.message}
                  </li>
                ))}
                {hints.map((h, i) => (
                  <li key={"h" + i} className="text-parchment/80">
                    <b>{h.askerName}:</b> {h.question} → <i>{h.hint}</i>
                  </li>
                ))}
              </ul>
            </div>
            {error && <div className="mt-3 text-crimson text-sm">{error}</div>}
          </motion.section>
        )}
      </AnimatePresence>

      {(room.storedPhase === "playing" || room.storedPhase === "ended") && (
        <>
          <button
            onClick={() => setExitOpen(true)}
            className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 px-5 py-2 rounded-full bg-parchment/10 hover:bg-parchment/20 border border-parchment/25 text-parchment/80 text-xs uppercase tracking-widest"
          >
            Lobby
          </button>
          {exitOpen && (
            <div className="fixed inset-0 bg-ink/80 backdrop-blur flex items-center justify-center z-[60]">
              <div className="card max-w-sm w-[90%] text-center">
                <div className="text-accent text-xs uppercase tracking-widest">Exit game</div>
                <p className="mt-3 text-parchment/90">Are you sure you want to leave the game?</p>
                <div className="mt-6 flex gap-3 justify-center">
                  <button onClick={() => setExitOpen(false)} className="btn-pill">Stay</button>
                  <Link href="/" className="btn-primary !py-2 !px-4">Leave the Game</Link>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PlayerTimerBadge({ timer }: { timer: TimerDisplay }) {
  if (timer.kind === "thinking")
    return <span className="text-accent text-sm tabular-nums font-display">{fmt(timer.remainingMs)}</span>;
  if (timer.kind === "next_keyword")
    return (
      <span className="text-parchment/70 text-xs text-right">
        Next keyword in<br />
        <span className="text-parchment font-display tabular-nums">{fmt(timer.remainingMs)}</span>
      </span>
    );
  if (timer.kind === "bonus_reveal")
    return (
      <span className="text-accent text-xs animate-pulse">
        {timer.nth === 1 ? "Bonus keyword!" : "Final keyword!"}
      </span>
    );
  return null;
}
