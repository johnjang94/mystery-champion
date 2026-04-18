"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";

const QRScanner = dynamic(() => import("@/components/QRScanner"), { ssr: false });

export default function HomePage() {
  const [scanOpen, setScanOpen] = useState(false);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="relative min-h-screen w-full flex flex-col items-center justify-center px-6"
    >
      <div className="absolute top-10 left-0 right-0 flex justify-center pointer-events-none">
        <div className="text-accent/70 tracking-[0.4em] text-xs uppercase">The Last Crown</div>
      </div>

      <h1 className="text-4xl md:text-6xl text-center font-display text-parchment leading-tight max-w-3xl">
        The <span className="text-accent">Last Crown</span>
      </h1>

      <p className="mt-6 text-parchment/60 text-center max-w-xl">
        Who is ready to take the crown?
      </p>

      <Link href="/host" className="btn-primary mt-12 text-lg">
        Get Started
      </Link>

      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-6 px-6">
        <Link href="/how-to-play" className="btn-ghost">
          How to play
        </Link>

        <button
          onClick={() => setScanOpen(true)}
          className="flex items-center gap-2 btn-ghost"
          aria-label="Scan QR code to join a room"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h1v1h-1zM18 14h1v1h-1zM16 16h1v1h-1zM14 18h1v1h-1zM18 18h1v1h-1zM20 16h1v1h-1zM20 20h1v1h-1z" fill="currentColor" stroke="none" />
          </svg>
          Join a Room
        </button>
      </div>

      <QRScanner open={scanOpen} onClose={() => setScanOpen(false)} />
    </motion.main>
  );
}
