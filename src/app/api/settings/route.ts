import { NextRequest, NextResponse } from "next/server";
import { getAllKeysMasked, setKeys } from "@/lib/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = [
  "OPENAI_API_KEY",
  "OPENAI_TEXT_MODEL",
  "OPENAI_IMAGE_MODEL",
  "OPENAI_TTS_MODEL",
  "OPENAI_TTS_VOICE",
];

function mask(v: string) {
  if (!v) return "";
  if (v.length <= 8) return "•".repeat(v.length);
  return v.slice(0, 4) + "…" + v.slice(-4);
}

export async function GET() {
  const all = await getAllKeysMasked();
  const out: Record<string, { set: boolean; preview: string }> = {};
  for (const k of ALLOWED) {
    const v = all[k] || "";
    out[k] = { set: !!v, preview: (k.endsWith("_API_KEY") || k.endsWith("_ACCESS_KEY")) ? mask(v) : v };
  }
  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const filtered: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED.includes(k)) continue;
    if (typeof v !== "string") continue;
    filtered[k] = v;
  }
  await setKeys(filtered);
  return NextResponse.json({ ok: true });
}
