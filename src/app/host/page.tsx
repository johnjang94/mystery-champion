"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import QRCode from "qrcode";
import { GENRES } from "@/lib/genres";
import { DIFFICULTIES } from "@/lib/difficulties";
import { derivePhase, fmt } from "@/lib/phase";
import type { Difficulty, Mode, RoomState } from "@/types/game";
import { api, getPlayerId, speakOpenAI, subscribeRoom } from "@/lib/client";
import ParticipantsModal from "@/components/ParticipantsModal";

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.45 },
};

type LoadStep =
  | { status: "idle" }
  | { status: "scenario"; label: string }
  | { status: "images"; done: number; total: number }
  | { status: "ready" };

export default function HostPage() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [qr, setQr] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [loadStep, setLoadStep] = useState<LoadStep>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null);
  const [mode, setMode] = useState<Mode>("team");
  const announcedRef = useRef<Set<string>>(new Set());
  const imgLoadedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const playerId = getPlayerId();
        const { room } = await api<{ room: RoomState }>("/api/room/create", {
          hostName: "Host",
          mode: "team",
        });
        setRoom(room);
        setMode(room.mode);
        const subs = subscribeRoom(room.code, null, playerId, {
          onState: (next) => {
            setRoom(next);
            setMode(next.mode);
          },
        });
        return () => subs.unsubscribe();
      } catch (e: any) {
        setError(String(e?.message || e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!room) return;
    setSelectedGenre(room.genre);
    setSelectedDifficulty(room.difficulty);
  }, [room?.genre, room?.difficulty]);

  useEffect(() => {
    if (!room) return;
    const url = `${location.origin}/play/${room.code}`;
    QRCode.toDataURL(url, {
      margin: 2,
      width: 280,
      color: { dark: "#0b0b10", light: "#ffffff" },
    }).then(setQr);
  }, [room?.code]);

  useEffect(() => {
    if (!room) return;
    const tick = () => {
      const d = derivePhase(room);
      const key = d.phase + ":" + d.revealedBonus + ":" + room.storedPhase + ":" + room.winner;
      if (announcedRef.current.has(key)) return;
      announcedRef.current.add(key);
      if (room.storedPhase === "playing" && d.phase === "thinking") {
        speakOpenAI("The round begins now.");
      }
      if (d.phase === "active") speakOpenAI("You may now ask questions and attempt answers.");
      if (d.phase === "bonus1") speakOpenAI("A new bonus keyword is now revealed.");
      if (d.phase === "bonus2") speakOpenAI("The final bonus keyword is now revealed.");
      if (d.phase === "ended" && room.winner != null) speakOpenAI("The round has been decided.");
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [room]);

  useEffect(() => {
    if (!room?.scenario || room.storedPhase !== "playing") return;
    if (imgLoadedRef.current) return;
    imgLoadedRef.current = true;

    const photos = room.scenario.photos;
    const needsLoad = photos.filter((photo) => !photo.imageUrl);
    if (needsLoad.length === 0) {
      setLoadStep({ status: "ready" });
      return;
    }

    let done = photos.filter((photo) => photo.imageUrl).length;
    const total = photos.length;
    setLoadStep({ status: "images", done, total });

    photos.forEach((photo, idx) => {
      if (photo.imageUrl) return;
      api("/api/room/image", { code: room.code, photoIndex: idx })
        .then(() => {
          done += 1;
          setLoadStep(done >= total ? { status: "ready" } : { status: "images", done, total });
        })
        .catch(() => {
          done += 1;
          setLoadStep(done >= total ? { status: "ready" } : { status: "images", done, total });
        });
    });
  }, [room?.storedPhase, room?.code, room?.scenario]);

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
            onEdit={() => setEditOpen(true)}
            onContinue={() => api("/api/room/teams", { code: room.code, mode })}
          />
        )}

        {room.storedPhase === "genre" && (
          <GenreScreen
            key="genre"
            selected={selectedGenre}
            onSelect={setSelectedGenre}
            onContinue={() => api("/api/room/phase", { code: room.code, phase: "difficulty" })}
          />
        )}

        {room.storedPhase === "difficulty" && (
          <DifficultyScreen
            key="difficulty"
            selected={selectedDifficulty}
            loadStep={loadStep}
            error={error}
            onSelect={setSelectedDifficulty}
            onBack={() => api("/api/room/phase", { code: room.code, phase: "genre" })}
            onStart={async () => {
              if (!selectedGenre || !selectedDifficulty) return;
              setError(null);
              imgLoadedRef.current = false;
              try {
                setLoadStep({ status: "scenario", label: "Writing the round with OpenAI…" });
                await api("/api/scenario", {
                  code: room.code,
                  genre: selectedGenre,
                  difficulty: selectedDifficulty,
                });
              } catch (e: any) {
                setError(String(e?.message || e));
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
        onRename={(id, name) => api("/api/room/rename", { code: room.code, targetId: id, name })}
      />
    </div>
  );
}

function LobbyScreen({
  room,
  qr,
  mode,
  onModeChange,
  onEdit,
  onContinue,
}: {
  room: RoomState;
  qr: string;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onEdit: () => void;
  onContinue: () => void;
}) {
  const joinUrl = typeof window !== "undefined" ? `${location.origin}/play/${room.code}` : "";
  const playableCount = room.players.filter((player) => !player.isHost).length;
  const isSolo = mode === "solo";

  return (
    <motion.section {...fade} className="relative min-h-screen flex flex-col items-center px-6 pt-20 pb-10">
      <h2 className="text-3xl text-accent font-display">Game Conditions</h2>
      <p className="mt-3 text-parchment/70 text-center max-w-xl">
        {isSolo
          ? "Step 1: solo mode selected — no other players needed. Continue to choose the game type."
          : "Step 1: choose whether this round is solo or group play, then invite players into the room."}
      </p>

      <div className="mt-6 flex gap-2 bg-parchment/10 rounded-full p-1 border border-parchment/15">
        {(["solo", "team"] as const).map((value) => (
          <button
            key={value}
            onClick={() => onModeChange(value)}
            className={
              "px-5 py-2 rounded-full text-sm transition " +
              (mode === value ? "bg-accent text-ink" : "text-parchment/70 hover:bg-parchment/10")
            }
          >
            {value === "solo" ? "Solo" : "Group"}
          </button>
        ))}
      </div>

      <div className={`mt-8 gap-8 items-start max-w-5xl w-full ${isSolo ? "flex justify-center" : "grid md:grid-cols-2"}`}>
        {!isSolo && (
          <div className="card flex flex-col items-center">
            {qr ? <img src={qr} alt="QR" className="w-56 h-56" /> : <div className="w-56 h-56" />}
            <div className="mt-3 text-parchment/60 text-xs break-all max-w-xs text-center">{joinUrl}</div>
            <div className="mt-2 text-accent text-3xl tracking-[0.4em]">{room.code}</div>
          </div>
        )}

        <div className="card min-w-[260px]">
          <div className="flex items-center justify-between gap-3">
            <div className="text-parchment/60 text-xs uppercase tracking-widest">Players</div>
            {!isSolo && <button onClick={onEdit} className="btn-pill !py-2 !px-4">Edit Participants</button>}
          </div>
          <ul className="mt-4 space-y-1 text-parchment/90 max-h-72 overflow-auto">
            {room.players.map((player) => (
              <li key={player.id} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent" />
                {player.name} {player.isHost && <span className="text-accent/60 text-xs">(host)</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <button
        onClick={onContinue}
        disabled={!isSolo && playableCount < 1}
        className="mt-10 btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue to Game Type
      </button>
    </motion.section>
  );
}

function GenreScreen({
  selected,
  onSelect,
  onContinue,
}: {
  selected: string | null;
  onSelect: (genre: string) => void;
  onContinue: () => void;
}) {
  return (
    <motion.section {...fade} className="relative min-h-screen flex flex-col items-center px-6 pt-20 pb-10">
      <h2 className="text-3xl text-accent font-display">Game Conditions</h2>
      <p className="mt-3 text-parchment/70 text-center max-w-xl">
        Step 2: choose the kind of game you want to play.
      </p>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl w-full">
        {GENRES.map((genre) => (
          <button
            key={genre.name}
            onClick={() => onSelect(genre.name)}
            className={
              "card text-left transition " +
              (selected === genre.name ? "ring-2 ring-accent shadow-glow" : "hover:bg-parchment/10")
            }
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl">{genre.emoji}</div>
              <div>
                <div className="text-parchment font-medium">{genre.name}</div>
                <p className="mt-2 text-parchment/65 text-sm">{genre.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={onContinue}
        disabled={!selected}
        className="absolute bottom-6 right-6 btn-primary !py-3 !px-6 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </motion.section>
  );
}

function DifficultyScreen({
  selected,
  loadStep,
  error,
  onSelect,
  onBack,
  onStart,
}: {
  selected: Difficulty | null;
  loadStep: LoadStep;
  error: string | null;
  onSelect: (difficulty: Difficulty) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const busy = loadStep.status === "scenario" || loadStep.status === "images";

  return (
    <motion.section {...fade} className="relative min-h-screen flex flex-col items-center px-6 pt-20 pb-10">
      <h2 className="text-3xl text-accent font-display">Game Conditions</h2>
      <p className="mt-3 text-parchment/70 text-center max-w-xl">
        Step 3: choose the difficulty level, then start the round.
      </p>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl w-full">
        {DIFFICULTIES.map((difficulty) => (
          <button
            key={difficulty.value}
            onClick={() => !busy && onSelect(difficulty.value)}
            className={
              "card text-left transition " +
              (selected === difficulty.value ? "ring-2 ring-accent shadow-glow" : "hover:bg-parchment/10") +
              (busy ? " opacity-60 pointer-events-none" : "")
            }
          >
            <div className="text-accent text-xs uppercase tracking-widest">{difficulty.label}</div>
            <p className="mt-3 text-parchment/80 text-sm">{difficulty.tagline}</p>
          </button>
        ))}
      </div>

      {loadStep.status !== "idle" && loadStep.status !== "ready" && (
        <div className="mt-6 card max-w-md w-full">
          <PrepStep done={loadStep.status !== "scenario"} label="Writing the round with OpenAI" />
          {loadStep.status === "images" && (
            <PrepStep
              done={loadStep.done >= loadStep.total}
              label={`Creating the images with OpenAI (${loadStep.done} / ${loadStep.total})`}
            />
          )}
        </div>
      )}

      {error && <div className="mt-4 text-crimson text-sm">{error}</div>}

      <button onClick={onBack} className="absolute bottom-6 left-6 btn-pill !py-3 !px-6">
        Back
      </button>
      <button
        onClick={onStart}
        disabled={!selected || busy}
        className="absolute bottom-6 right-6 btn-primary !py-3 !px-6 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Start Game
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
  const scenario = room.scenario!;
  const [now, setNow] = useState(Date.now());
  const [exitOpen, setExitOpen] = useState(false);
  const announcedTimerRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const d = derivePhase(room, now);
  const visibleBonus = scenario.bonusKeywords.slice(0, d.revealedBonus);

  useEffect(() => {
    const key = d.timer.kind + (d.timer.kind === "bonus_reveal" ? d.timer.nth : "");
    if (announcedTimerRef.current.has(key)) return;
    announcedTimerRef.current.add(key);
    if (d.timer.kind === "next_keyword" && d.timer.nth === 1) {
      speakOpenAI("Five minutes are up. The next bonus keyword arrives in three minutes.");
    }
    if (d.timer.kind === "bonus_reveal" && d.timer.nth === 1) {
      speakOpenAI(`An additional keyword is now revealed: ${d.timer.keyword}.`);
    }
    if (d.timer.kind === "next_keyword" && d.timer.nth === 2) {
      speakOpenAI("The final bonus keyword will be revealed in three minutes.");
    }
    if (d.timer.kind === "bonus_reveal" && d.timer.nth === 2) {
      speakOpenAI(`The final keyword is now revealed: ${d.timer.keyword}.`);
    }
  }, [d.timer]);

  return (
    <motion.section {...fade} className="relative min-h-screen px-4 sm:px-6 py-16 sm:py-20 pb-24">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 max-w-6xl mx-auto">
        <div className="order-2 sm:order-1 flex gap-2 sm:gap-6 flex-wrap justify-center sm:justify-start">
          {room.mode === "team" ? (
            <>
              <ScoreBox label="Team 1" score={room.scores[0]} accent="text-crimson" winner={room.winner === 0} />
              <ScoreBox label="Team 2" score={room.scores[1]} accent="text-accent" winner={room.winner === 1} />
            </>
          ) : (
            room.players.filter((player) => !player.isHost).slice(0, 6).map((player) => (
              <ScoreBox
                key={player.id}
                label={player.name}
                score={player.score}
                accent="text-accent"
                winner={room.winner === player.id}
              />
            ))
          )}
        </div>
        <div className="order-1 sm:order-2">
          <TimerWidget timer={d.timer} />
        </div>
      </header>

      <section className="mt-6 sm:mt-10 max-w-5xl mx-auto grid lg:grid-cols-[1.4fr_0.9fr] gap-4">
        <div className="card">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-accent text-ink text-xs uppercase tracking-widest">
              {room.genre}
            </span>
            {room.difficulty && (
              <span className="px-3 py-1 rounded-full border border-accent/35 text-accent text-xs uppercase tracking-widest">
                {room.difficulty}
              </span>
            )}
          </div>
          <div className="mt-4 text-accent text-xs uppercase tracking-widest">Passage</div>
          <p className="mt-2 text-parchment/90 italic">{scenario.briefing}</p>
          <p className="mt-3 text-parchment/80">
            <span className="text-parchment/50 text-xs uppercase tracking-widest mr-2">Question</span>
            {scenario.question}
          </p>
        </div>

        <div className="card">
          <div className="text-accent text-xs uppercase tracking-widest">Round Notes</div>
          <ul className="mt-3 space-y-2 text-sm text-parchment/80">
            <li>All passages and images for this round are generated by the OpenAI API.</li>
            <li>Whoever has more points wins the game.</li>
            <li>Ask a question if you want a hint, but it costs 1 point.</li>
          </ul>
        </div>
      </section>

      {room.genre === "Visual Match" ? (
        <section className="mt-6 grid lg:grid-cols-2 gap-4 max-w-5xl mx-auto">
          <div className="card">
            <div className="text-accent text-xs uppercase tracking-widest">3D View</div>
            <div className="mt-3 w-full aspect-square rounded-lg overflow-hidden bg-gradient-to-br from-parchment/15 to-parchment/5 border border-parchment/15 relative">
              {scenario.photos[0]?.imageUrl ? (
                <motion.img
                  src={scenario.photos[0].imageUrl || ""}
                  alt={scenario.photos[0].keyword}
                  className="w-full h-full object-cover"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6 }}
                />
              ) : (
                <LoadingArt />
              )}
            </div>
          </div>
          <div className="card">
            <div className="text-accent text-xs uppercase tracking-widest">2D Maze</div>
            <div className="mt-3">
              <MazeBoard seed={scenario.solutionKeywords.join("-")} />
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-5xl mx-auto">
          {scenario.photos.map((photo, index) => (
            <div key={index} className="card flex flex-col items-center">
              <div className="w-full aspect-square rounded-lg overflow-hidden bg-gradient-to-br from-parchment/15 to-parchment/5 border border-parchment/15 relative">
                {photo.imageUrl ? (
                  <motion.img
                    src={photo.imageUrl}
                    alt={photo.keyword}
                    className="w-full h-full object-cover"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6 }}
                  />
                ) : (
                  <LoadingArt />
                )}
              </div>
              <div className="mt-2 text-accent text-sm">{photo.keyword}</div>
            </div>
          ))}
        </section>
      )}

      <section className="mt-6 max-w-5xl mx-auto grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="card">
          <div className="text-accent text-xs uppercase tracking-widest">Clue Keywords</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {scenario.photos.map((photo) => (
              <span key={photo.keyword} className="px-3 py-1 rounded-full bg-accent/15 border border-accent/40 text-accent text-xs">
                {photo.keyword}
              </span>
            ))}
            {visibleBonus.map((keyword) => (
              <span key={keyword} className="px-3 py-1 rounded-full bg-crimson/20 border border-crimson text-parchment text-xs">
                {keyword} ★
              </span>
            ))}
          </div>
        </div>

        {scenario.choices?.length ? (
          <div className="card">
            <div className="text-accent text-xs uppercase tracking-widest">Possible Answers</div>
            <ul className="mt-3 space-y-2 text-sm text-parchment/80">
              {scenario.choices.map((choice) => (
                <li key={choice} className="rounded-lg border border-parchment/10 px-3 py-2 bg-parchment/5">
                  {choice}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="mt-6 max-w-5xl mx-auto card max-h-48 overflow-auto">
        <div className="text-accent text-xs uppercase tracking-widest">Activity</div>
        <ul className="mt-2 space-y-1 text-parchment/70 text-sm">
          {room.activity.map((activity) => (
            <li key={activity.id}>• {activity.text}</li>
          ))}
        </ul>
      </section>

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
                {visibleBonus.map((keyword, index) => (
                  <motion.span
                    key={keyword}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: index * 0.15, type: "spring", stiffness: 300 }}
                    className="px-4 py-1.5 rounded-full bg-accent text-ink font-semibold text-sm shadow-glow"
                  >
                    {keyword}
                  </motion.span>
                ))}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {room.storedPhase === "ended" && <EndModal room={room} solution={scenario.solutionAnswer} />}

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

function LoadingArt() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <svg className="w-7 h-7 animate-spin text-accent/60" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span className="text-parchment/40 text-[10px] text-center px-2">Creating image…</span>
    </div>
  );
}

function MazeBoard({ seed }: { seed: string }) {
  const letters = ["A", "B", "C", "D", "E", "F"];
  const cells = Array.from({ length: 36 }, (_, index) => {
    const code = seed.charCodeAt(index % seed.length) || 0;
    return (code + index) % 4 === 0;
  });

  return (
    <div className="grid grid-cols-[28px_repeat(6,minmax(0,1fr))] gap-1 text-center text-xs text-parchment/80">
      <div />
      {letters.map((letter) => (
        <div key={letter} className="text-accent/80 uppercase">{letter}</div>
      ))}
      {Array.from({ length: 6 }, (_, row) => (
        <div key={row} className="contents">
          <div className="flex items-center justify-center text-accent/80">{row + 1}</div>
          {Array.from({ length: 6 }, (_, col) => {
            const active = cells[row * 6 + col];
            return (
              <div
                key={`${row}-${col}`}
                className={
                  "aspect-square rounded border border-parchment/10 " +
                  (active ? "bg-accent/25 shadow-glow" : "bg-parchment/5")
                }
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ExitGameModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur flex items-center justify-center z-[60]">
      <div className="card max-w-sm w-[90%] text-center">
        <div className="text-accent text-xs uppercase tracking-widest">Exit game</div>
        <p className="mt-3 text-parchment/90">Are you sure you want to leave the game?</p>
        <div className="mt-6 flex gap-3 justify-center">
          <button onClick={onClose} className="btn-pill">Stay</button>
          <Link href="/" className="btn-primary !py-2 !px-4">Leave the Game</Link>
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
        <div className="text-parchment/60 text-xs uppercase tracking-widest">Next keyword in</div>
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
      const player = room.players.find((entry) => entry.id === room.winner);
      title = player ? `${player.name} wins!` : "Winner";
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
