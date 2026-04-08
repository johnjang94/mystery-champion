"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import QRCode from "qrcode";
import { GENRES } from "@/lib/genres";
import { derivePhase, fmt } from "@/lib/phase";
import type { Mode, RoomState } from "@/types/game";
import { api, getPlayerId, speakOpenAI, subscribeRoom } from "@/lib/client";
import ParticipantsModal from "@/components/ParticipantsModal";

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.5 },
};

type LoadStep =
  | { status: "idle" }
  | { status: "scenario"; label: string }
  | { status: "images"; done: number; total: number }
  | { status: "ready" };

export default function HostPage() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [qr, setQr] = useState<string>("");
  const [editOpen, setEditOpen] = useState(false);
  const [loadStep, setLoadStep] = useState<LoadStep>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("team");
  const announcedRef = useRef<Set<string>>(new Set());
  const imgLoadedRef = useRef(false); // prevent double-triggering

  // Create the room on mount.
  useEffect(() => {
    (async () => {
      try {
        const playerId = getPlayerId();
        const { room } = await api<{ room: RoomState }>("/api/room/create", {
          hostName: "Host",
          mode: "team",
        });
        setRoom(room);
        const subs = subscribeRoom(room.code, null, playerId, { onState: setRoom });
        return () => subs.unsubscribe();
      } catch (e: any) {
        setError(String(e?.message || e));
      }
    })();
  }, []);

  // QR
  useEffect(() => {
    if (!room) return;
    const url = `${location.origin}/play/${room.code}`;
    QRCode.toDataURL(url, {
      margin: 2,
      width: 280,
      color: { dark: "#0b0b10", light: "#ffffff" },
    }).then(setQr);
  }, [room?.code]);

  // Voice announcements based on derived phase
  useEffect(() => {
    if (!room) return;
    const tick = () => {
      const d = derivePhase(room);
      const key = d.phase + ":" + d.revealedBonus + ":" + room.storedPhase + ":" + room.winner;
      if (announcedRef.current.has(key)) return;
      announcedRef.current.add(key);
      if (room.storedPhase === "playing" && d.phase === "thinking")
        speakOpenAI("The five minute countdown begins now.");
      if (d.phase === "active") speakOpenAI("You may now ask questions and attempt answers.");
      if (d.phase === "bonus1") speakOpenAI("A new bonus keyword is now revealed.");
      if (d.phase === "bonus2") speakOpenAI("The final bonus keyword is now revealed.");
      if (d.phase === "ended" && room.winner != null)
        speakOpenAI("The case has been solved.");
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [room]);

  // Kick off per-photo image loading once the scenario is in KV.
  useEffect(() => {
    if (!room?.scenario || room.storedPhase !== "playing") return;
    if (imgLoadedRef.current) return;
    imgLoadedRef.current = true;

    const photos = room.scenario.photos;
    const needsLoad = photos.filter((p) => !p.imageUrl);
    if (needsLoad.length === 0) {
      setLoadStep({ status: "ready" });
      return;
    }

    let done = photos.filter((p) => p.imageUrl).length;
    const total = photos.length;
    setLoadStep({ status: "images", done, total });

    photos.forEach((photo, idx) => {
      if (photo.imageUrl) return; // already loaded
      api("/api/room/image", { code: room.code, photoIndex: idx })
        .then(() => {
          done += 1;
          if (done >= total) {
            setLoadStep({ status: "ready" });
          } else {
            setLoadStep({ status: "images", done, total });
          }
        })
        .catch(() => {
          done += 1; // count failures so we don't get stuck
          if (done >= total) setLoadStep({ status: "ready" });
          else setLoadStep({ status: "images", done, total });
        });
    });
  }, [room?.storedPhase, room?.code]);

  if (!room) {
    return (
      <main className="min-h-screen flex items-center justify-center text-parchment/70">
        {error || "Connecting…"}
      </main>
    );
  }

  return (
    <div className="min-h-screen w-full">
      <Link href="/" className="absolute top-6 left-6 text-parchment/60 hover:text-parchment text-sm z-10">
        ← Home
      </Link>

      <AnimatePresence mode="wait">
        {room.storedPhase === "lobby" && (
          <LobbyScreen
            key="lobby"
            room={room}
            qr={qr}
            mode={mode}
            onModeChange={setMode}
            onTeams={() => api("/api/room/teams", { code: room.code, mode })}
          />
        )}

        {room.storedPhase === "teams" && (
          <TeamsScreen
            key="teams"
            room={room}
            onContinue={() => api("/api/room/phase", { code: room.code, phase: "genre" })}
            onEdit={() => setEditOpen(true)}
          />
        )}

        {room.storedPhase === "genre" && (
          <GenreScreen
            key="genre"
            room={room}
            selected={selectedGenre}
            onSelect={(g) => setSelectedGenre(g)}
            onEdit={() => setEditOpen(true)}
            loadStep={loadStep}
            error={error}
            onContinue={async () => {
              if (!selectedGenre) return;
              setError(null);
              imgLoadedRef.current = false;
              try {
                setLoadStep({ status: "scenario", label: "Writing the case with Claude…" });
                await api("/api/scenario", { code: room.code, genre: selectedGenre });
                // Image loading kicks off from the useEffect below when storedPhase → "playing"
              } catch (e: any) {
                setError(String(e.message || e));
                setLoadStep({ status: "idle" });
              }
            }}
          />
        )}

        {(room.storedPhase === "playing" || room.storedPhase === "ended") && (
          <GameScreen key="game" room={room} />
        )}
      </AnimatePresence>

      <ParticipantsModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        room={room}
        onRename={(id, name) =>
          api("/api/room/rename", { code: room.code, targetId: id, name })
        }
      />
    </div>
  );
}

/* ───────────── Screens ───────────── */

function LobbyScreen({
  room,
  qr,
  mode,
  onModeChange,
  onTeams,
}: {
  room: RoomState;
  qr: string;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onTeams: () => void;
}) {
  const joinUrl = typeof window !== "undefined" ? `${location.origin}/play/${room.code}` : "";
  const playableCount = room.players.filter((p) => !p.isHost).length;
  return (
    <motion.section {...fade} className="relative min-h-screen flex flex-col items-center px-6 pt-20">
      <h2 className="text-3xl text-accent font-display">Form a Team</h2>
      <p className="mt-3 text-parchment/70 text-center max-w-xl">
        Players join from their phones. Pick a mode, then form teams.
      </p>

      <div className="mt-6 flex gap-2 bg-parchment/10 rounded-full p-1 border border-parchment/15">
        {(["team", "solo"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={
              "px-5 py-2 rounded-full text-sm transition " +
              (mode === m ? "bg-accent text-ink" : "text-parchment/70 hover:bg-parchment/10")
            }
          >
            {m === "team" ? "Team mode" : "Solo / PvP"}
          </button>
        ))}
      </div>

      <div className="mt-8 grid md:grid-cols-2 gap-8 items-center">
        <div className="card flex flex-col items-center">
          {qr ? <img src={qr} alt="QR" className="w-56 h-56" /> : <div className="w-56 h-56" />}
          <div className="mt-3 text-parchment/60 text-xs break-all max-w-xs text-center">{joinUrl}</div>
          <div className="mt-2 text-accent text-3xl tracking-[0.4em]">{room.code}</div>
        </div>
        <div className="card min-w-[260px]">
          <div className="text-parchment/60 text-xs uppercase tracking-widest">Players</div>
          <ul className="mt-3 space-y-1 text-parchment/90 max-h-72 overflow-auto">
            {room.players.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent" />
                {p.name} {p.isHost && <span className="text-accent/60 text-xs">(host)</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <button
        onClick={onTeams}
        disabled={playableCount < 1}
        className="mt-10 btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {mode === "team" ? "Form Teams" : "Start Solo"}
      </button>
    </motion.section>
  );
}

function TeamsScreen({
  room,
  onContinue,
  onEdit,
}: {
  room: RoomState;
  onContinue: () => void;
  onEdit: () => void;
}) {
  const teamA = room.players.filter((p) => p.team === 0);
  const teamB = room.players.filter((p) => p.team === 1);
  return (
    <motion.section {...fade} className="relative min-h-screen flex flex-col items-center px-6 pt-20">
      <h2 className="text-3xl text-accent font-display">
        {room.mode === "solo" ? "Solo Lineup" : "Teams Formed"}
      </h2>
      <button onClick={onEdit} className="absolute top-20 right-6 btn-pill">
        Edit Participants
      </button>
      {room.mode === "solo" ? (
        <ul className="mt-10 card w-full max-w-md space-y-1">
          {room.players.filter((p) => !p.isHost).map((p) => <li key={p.id}>{p.name}</li>)}
        </ul>
      ) : (
        <div className="mt-10 grid md:grid-cols-2 gap-8 max-w-3xl w-full">
          <div className="card">
            <div className="text-crimson text-xs uppercase tracking-widest">Team 1</div>
            <ul className="mt-3 space-y-1">{teamA.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
          </div>
          <div className="card">
            <div className="text-accent text-xs uppercase tracking-widest">Team 2</div>
            <ul className="mt-3 space-y-1">{teamB.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
          </div>
        </div>
      )}
      <button onClick={onContinue} className="absolute bottom-6 right-6 btn-primary !py-3 !px-6">
        Next
      </button>
    </motion.section>
  );
}

function GenreScreen({
  room,
  selected,
  onSelect,
  onEdit,
  onContinue,
  loadStep,
  error,
}: {
  room: RoomState;
  selected: string | null;
  onSelect: (g: string) => void;
  onEdit: () => void;
  onContinue: () => void;
  loadStep: LoadStep;
  error: string | null;
}) {
  const busy = loadStep.status === "scenario";

  return (
    <motion.section {...fade} className="relative min-h-screen flex flex-col items-center px-6 pt-20">
      <h2 className="text-3xl text-accent font-display">Choose a Genre</h2>
      <button onClick={onEdit} className="absolute top-20 right-6 btn-pill">
        Edit Participants
      </button>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl w-full">
        {GENRES.map((g) => (
          <button
            key={g.name}
            onClick={() => !busy && onSelect(g.name)}
            className={
              "card flex flex-col items-center transition " +
              (selected === g.name ? "ring-2 ring-accent shadow-glow" : "hover:bg-parchment/10") +
              (busy ? " opacity-50 pointer-events-none" : "")
            }
          >
            <div className="text-3xl">{g.emoji}</div>
            <div className="mt-2 text-parchment/90 text-sm">{g.name}</div>
          </button>
        ))}
      </div>

      {error && <div className="mt-4 text-crimson text-sm">{error}</div>}

      {/* Step-by-step loading indicator */}
      {loadStep.status !== "idle" && loadStep.status !== "ready" && (
        <div className="mt-6 card max-w-md w-full">
          <PrepStep
            done={loadStep.status !== "scenario"}
            label="Writing the case with Claude"
          />
          {loadStep.status === "images" && (
            <PrepStep
              done={loadStep.done >= loadStep.total}
              label={`Generating illustrations (${loadStep.done} / ${loadStep.total})`}
            />
          )}
        </div>
      )}

      <button
        onClick={onContinue}
        disabled={!selected || busy}
        className="absolute bottom-6 right-6 btn-primary !py-3 !px-6 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </motion.section>
  );
}

function PrepStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      {done ? (
        <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-xs text-white flex-shrink-0">✓</span>
      ) : (
        <span className="w-5 h-5 flex-shrink-0">
          <svg className="animate-spin text-accent" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </span>
      )}
      <span className={done ? "text-parchment/60 line-through text-sm" : "text-parchment/90 text-sm"}>
        {label}
      </span>
    </div>
  );
}

function GameScreen({ room }: { room: RoomState }) {
  const s = room.scenario!;
  const [now, setNow] = useState(Date.now());
  const [exitOpen, setExitOpen] = useState(false);
  const announcedTimerRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const d = derivePhase(room, now);

  // Voice announcements for timer transitions.
  useEffect(() => {
    const key = d.timer.kind + (d.timer.kind === "bonus_reveal" ? d.timer.nth : "");
    if (announcedTimerRef.current.has(key)) return;
    announcedTimerRef.current.add(key);
    if (d.timer.kind === "next_keyword" && d.timer.nth === 1)
      speakOpenAI("Five minutes are up. You may now ask questions and attempt answers. The next bonus keyword will be revealed in three minutes.");
    if (d.timer.kind === "bonus_reveal" && d.timer.nth === 1)
      speakOpenAI(`An additional keyword is now revealed: ${d.timer.keyword}.`);
    if (d.timer.kind === "next_keyword" && d.timer.nth === 2)
      speakOpenAI("The final bonus keyword will be revealed in three minutes.");
    if (d.timer.kind === "bonus_reveal" && d.timer.nth === 2)
      speakOpenAI(`The final keyword is now revealed: ${d.timer.keyword}.`);
  }, [d.timer.kind, (d.timer as any).nth]);

  const visibleBonus = s.bonusKeywords.slice(0, d.revealedBonus);

  return (
    <motion.section {...fade} className="relative min-h-screen px-4 sm:px-6 py-16 sm:py-20 pb-24">
      {/* ── Header: scores + timer ── */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 max-w-6xl mx-auto">
        <div className="order-2 sm:order-1 flex gap-2 sm:gap-6 flex-wrap justify-center sm:justify-start">
          {room.mode === "team" ? (
            <>
              <ScoreBox label="Team 1" score={room.scores[0]} accent="text-crimson" winner={room.winner === 0} />
              <ScoreBox label="Team 2" score={room.scores[1]} accent="text-accent" winner={room.winner === 1} />
            </>
          ) : (
            room.players.filter((p) => !p.isHost).slice(0, 6).map((p) => (
              <ScoreBox key={p.id} label={p.name} score={p.score} accent="text-accent" winner={room.winner === p.id} />
            ))
          )}
        </div>
        <div className="order-1 sm:order-2">
          <TimerWidget timer={d.timer} />
        </div>
      </header>

      {/* ── Case briefing ── */}
      <section className="mt-6 sm:mt-10 max-w-3xl mx-auto card">
        <div className="text-accent text-xs uppercase tracking-widest">Case Briefing</div>
        <p className="mt-2 text-parchment/90 italic">{s.briefing}</p>
        <p className="mt-3 text-parchment/80">
          <span className="text-parchment/50 text-xs uppercase tracking-widest mr-2">Question</span>
          {s.question}
        </p>
      </section>

      {/* ── Photos ── */}
      <section className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-5xl mx-auto">
        {s.photos.map((p, i) => (
          <div key={i} className="card flex flex-col items-center">
            <div className="w-full aspect-square rounded-lg overflow-hidden bg-gradient-to-br from-parchment/15 to-parchment/5 border border-parchment/15 relative">
              {p.imageUrl ? (
                <motion.img src={p.imageUrl} alt={p.keyword} className="w-full h-full object-cover"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <svg className="w-7 h-7 animate-spin text-accent/60" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span className="text-parchment/40 text-[10px] text-center px-2">Generating illustration…</span>
                </div>
              )}
            </div>
            <div className="mt-2 text-accent text-sm">{p.keyword}</div>
          </div>
        ))}
      </section>

      {/* ── Activity log ── */}
      <section className="mt-6 max-w-5xl mx-auto card max-h-48 overflow-auto">
        <div className="text-accent text-xs uppercase tracking-widest">Activity</div>
        <ul className="mt-2 space-y-1 text-parchment/70 text-sm">
          {room.activity.map((a) => (
            <li key={a.id}>• {a.text}</li>
          ))}
        </ul>
      </section>

      {/* ── Bonus keyword banner (bottom) ── */}
      <AnimatePresence>
        {visibleBonus.length > 0 && (
          <motion.section
            key="bonus"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.6 }}
            className="fixed bottom-0 left-0 right-0 bg-ink/90 backdrop-blur border-t border-accent/30 px-6 py-4 z-30"
          >
            <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-4">
              <span className="text-accent text-xs uppercase tracking-widest shrink-0">
                {d.timer.kind === "bonus_reveal"
                  ? d.timer.nth === 1
                    ? "Additional keyword revealed"
                    : "Final keyword revealed"
                  : "Bonus keywords"}
              </span>
              <div className="flex gap-3 flex-wrap">
                {visibleBonus.map((k, i) => (
                  <motion.span
                    key={k}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.15, type: "spring", stiffness: 300 }}
                    className="px-4 py-1.5 rounded-full bg-accent text-ink font-semibold text-sm shadow-glow"
                  >
                    {k}
                  </motion.span>
                ))}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {room.storedPhase === "ended" && <EndModal room={room} solution={s.solutionAnswer} />}

      {d.hiddenButtonShown && room.storedPhase !== "ended" && (
        <button
          onClick={() => api("/api/game/giveup", { code: room.code })}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 text-parchment/30 text-xs underline z-40"
        >
          I have no idea, cuckoo
        </button>
      )}

      <button
        onClick={() => setExitOpen(true)}
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 px-5 py-2 rounded-full bg-parchment/10 hover:bg-parchment/20 border border-parchment/25 text-parchment/80 text-xs uppercase tracking-widest"
      >
        Lobby
      </button>

      <ExitGameModal open={exitOpen} onClose={() => setExitOpen(false)} />
    </motion.section>
  );
}

function ExitGameModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur flex items-center justify-center z-[60]">
      <div className="card max-w-sm w-[90%] text-center">
        <div className="text-accent text-xs uppercase tracking-widest">Exit game</div>
        <p className="mt-3 text-parchment/90">Are you sure you want to exit the game?</p>
        <div className="mt-6 flex gap-3 justify-center">
          <button onClick={onClose} className="btn-pill">No</button>
          <Link href="/" className="btn-primary !py-2 !px-4">Yes</Link>
        </div>
      </div>
    </div>
  );
}

function TimerWidget({ timer }: { timer: ReturnType<typeof derivePhase>["timer"] }) {
  const baseNum = "text-4xl sm:text-5xl font-display tabular-nums";
  if (timer.kind === "thinking") {
    return (
      <div className="text-center">
        <div className="text-parchment/60 text-xs uppercase tracking-widest">Think</div>
        <div className={`${baseNum} text-accent`}>{fmt(timer.remainingMs)}</div>
      </div>
    );
  }
  if (timer.kind === "next_keyword") {
    return (
      <div className="text-center">
        <div className="text-parchment/60 text-xs uppercase tracking-widest">
          Next keyword in
        </div>
        <div className={`${baseNum} text-parchment`}>{fmt(timer.remainingMs)}</div>
      </div>
    );
  }
  if (timer.kind === "bonus_reveal") {
    return (
      <div className="text-center">
        <div className="text-accent text-xs uppercase tracking-widest animate-pulse">
          {timer.nth === 1 ? "Bonus keyword!" : "Final keyword!"}
        </div>
        <div className="text-2xl sm:text-3xl text-accent font-display mt-1">{timer.keyword}</div>
      </div>
    );
  }
  // open
  return (
    <div className="text-center">
      <div className="text-parchment/40 text-xs uppercase tracking-widest">Time</div>
      <div className={`${baseNum} text-parchment/50`}>— : —</div>
    </div>
  );
}

function ScoreBox({
  label,
  score,
  accent,
  winner,
}: {
  label: string;
  score: number;
  accent: string;
  winner: boolean;
}) {
  return (
    <div className={"card !p-3 min-w-[88px] sm:min-w-[120px] text-center " + (winner ? "ring-2 ring-accent" : "")}>
      <div className={"text-[10px] sm:text-xs uppercase tracking-widest truncate max-w-[120px] " + accent}>{label}</div>
      <div className="text-2xl sm:text-3xl font-display tabular-nums">{score}</div>
    </div>
  );
}

function EndModal({ room, solution }: { room: RoomState; solution: string }) {
  let title = "No winner";
  if (room.winner != null) {
    if (typeof room.winner === "number") title = `Team ${room.winner + 1} wins!`;
    else {
      const p = room.players.find((p) => p.id === room.winner);
      title = p ? `${p.name} wins!` : "Winner";
    }
  }
  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur flex items-center justify-center z-50">
      <div className="card max-w-md text-center">
        <div className="text-accent text-xs uppercase tracking-widest">{title}</div>
        <p className="mt-3 text-parchment/90">{solution}</p>
        <div className="mt-6 flex gap-3 justify-center">
          <Link href="/" className="btn-primary !py-2 !px-4">
            New Game
          </Link>
        </div>
      </div>
    </div>
  );
}
