"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { GENRES } from "@/lib/genres";
import { DIFFICULTIES } from "@/lib/difficulties";

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.45 },
};

function ScreenShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.section {...fade} className="relative min-h-screen w-full px-6 py-12 flex flex-col items-center">
      <Link href="/" className="absolute top-6 left-6 text-parchment/60 hover:text-parchment text-sm">
        ← Home
      </Link>
      {children}
    </motion.section>
  );
}

function NextButton({ onClick, label = "Next" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="absolute bottom-6 right-6 btn-primary !py-3 !px-6 text-base">
      {label}
    </button>
  );
}

export default function HowToPlayPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  return (
    <div className="min-h-screen w-full">
      <AnimatePresence mode="wait">
        {step === 1 && (
          <ScreenShell key="step-1">
            <h2 className="text-3xl text-accent font-display mt-6">How to Play — 1 / 4</h2>
            <p className="mt-6 text-center max-w-2xl text-parchment/90 text-lg">
              You can play by yourself, matched with AI or other players who are online, or you
              can play as a group. This is the mode selection step.
            </p>
            <div className="mt-10 grid md:grid-cols-2 gap-5 max-w-3xl w-full">
              <div className="card text-center">
                <div className="text-accent text-xs uppercase tracking-widest">Solo</div>
                <p className="mt-3 text-parchment/85">Go alone and chase the crown on your own pace.</p>
              </div>
              <div className="card text-center">
                <div className="text-accent text-xs uppercase tracking-widest">Group</div>
                <p className="mt-3 text-parchment/85">Talk it through together and see who reads the clues best.</p>
              </div>
            </div>
            <NextButton onClick={() => setStep(2)} />
          </ScreenShell>
        )}

        {step === 2 && (
          <ScreenShell key="step-2">
            <h2 className="text-3xl text-accent font-display mt-6">How to Play — 2 / 4</h2>
            <p className="mt-6 text-center max-w-2xl text-parchment/90 text-lg">
              Next, you choose the kind of game you want to play: riddles, guess, visual-maze
              match, number-to-letter conversion, and more.
            </p>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl w-full">
              {GENRES.map((genre) => (
                <div key={genre.name} className="card">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">{genre.emoji}</div>
                    <div>
                      <div className="text-parchment font-medium">{genre.name}</div>
                      <div className="text-parchment/60 text-sm">{genre.description}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <NextButton onClick={() => setStep(3)} />
          </ScreenShell>
        )}

        {step === 3 && (
          <ScreenShell key="step-3">
            <h2 className="text-3xl text-accent font-display mt-6">How to Play — 3 / 4</h2>
            <p className="mt-6 text-center max-w-2xl text-parchment/90 text-lg">
              Then you choose the level of challenge you want: easy, medium, hard, or challenger.
            </p>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl w-full">
              {DIFFICULTIES.map((difficulty) => (
                <div key={difficulty.value} className="card">
                  <div className="text-accent text-xs uppercase tracking-widest">{difficulty.label}</div>
                  <p className="mt-3 text-parchment/85">{difficulty.tagline}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-parchment/60 text-center max-w-xl">
              Whoever has more points wins the game.
            </p>
            <NextButton onClick={() => setStep(4)} />
          </ScreenShell>
        )}

        {step === 4 && (
          <ScreenShell key="step-4">
            <h2 className="text-3xl text-accent font-display mt-6">How to Play — 4 / 4</h2>
            <p className="mt-6 text-center max-w-2xl text-parchment/90 text-lg">
              After you choose the mode, type of game, and level of difficulty, the game begins.
              The passages and images are generated through the OpenAI API for that round.
            </p>
            <div className="mt-10 card max-w-2xl w-full text-center">
              <div className="text-accent text-xs uppercase tracking-widest">Ready</div>
              <p className="mt-3 text-parchment/85">
                When you understand the setup, return home and start building the room.
              </p>
            </div>
            <button
              onClick={() => router.push("/")}
              className="absolute bottom-6 right-6 btn-primary !py-3 !px-6 text-base"
            >
              I understand
            </button>
          </ScreenShell>
        )}
      </AnimatePresence>
    </div>
  );
}
