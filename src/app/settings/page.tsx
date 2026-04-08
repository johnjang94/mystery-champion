"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

type SettingsInfo = Record<string, { set: boolean; preview: string }>;

const FIELDS = [
  { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key", secret: true },
  { key: "ANTHROPIC_MODEL", label: "Anthropic Model", placeholder: "claude-haiku-4-5-20251001" },
  { key: "OPENAI_API_KEY", label: "OpenAI API Key", secret: true },
  { key: "OPENAI_TTS_MODEL", label: "OpenAI TTS Model", placeholder: "gpt-4o-mini-tts" },
  { key: "OPENAI_TTS_VOICE", label: "OpenAI TTS Voice", placeholder: "alloy" },
  { key: "UNSPLASH_ACCESS_KEY", label: "Unsplash Access Key", secret: true },
];

export default function SettingsPage() {
  const [info, setInfo] = useState<SettingsInfo>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setInfo);
  }, []);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen px-6 py-16 max-w-2xl mx-auto"
    >
      <Link href="/" className="text-parchment/60 hover:text-parchment text-sm">← Home</Link>
      <h1 className="mt-6 text-3xl text-accent font-display">Game Settings</h1>
      <p className="mt-2 text-parchment/60 text-sm">
        Backend credentials. Stored in the local SQLite database. Leave blank to keep existing.
      </p>

      <form
        className="mt-8 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const body: Record<string, string> = {};
          for (const k of Object.keys(drafts)) if (drafts[k]) body[k] = drafts[k];
          await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const fresh = await fetch("/api/settings").then((r) => r.json());
          setInfo(fresh);
          setDrafts({});
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }}
      >
        {FIELDS.map((f) => (
          <div key={f.key} className="card">
            <label className="text-accent text-xs uppercase tracking-widest">{f.label}</label>
            <div className="text-parchment/40 text-xs mt-1">
              {info[f.key]?.set ? `Current: ${info[f.key].preview}` : "Not set"}
            </div>
            <input
              type={f.secret ? "password" : "text"}
              value={drafts[f.key] ?? ""}
              onChange={(e) => setDrafts({ ...drafts, [f.key]: e.target.value })}
              placeholder={(f as any).placeholder || ""}
              className="mt-2 w-full bg-parchment/10 rounded px-3 py-2 text-parchment outline-none border border-parchment/15"
            />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary !py-2 !px-5">Save</button>
          {saved && <span className="text-emerald-400 text-sm">Saved.</span>}
        </div>
      </form>
    </motion.main>
  );
}
