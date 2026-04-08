import OpenAI from "openai";
import { getKey } from "./keys";

async function client() {
  const apiKey = await getKey("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set. Configure it in Settings.");
  return new OpenAI({ apiKey });
}

export async function generateSpeech(text: string): Promise<Buffer> {
  const c = await client();
  const model = (await getKey("OPENAI_TTS_MODEL")) || "gpt-4o-mini-tts";
  const voice = (await getKey("OPENAI_TTS_VOICE")) || "alloy";
  const res = await c.audio.speech.create({
    model,
    voice: voice as any,
    input: text,
    format: "mp3",
  } as any);
  const arrayBuffer = await (res as any).arrayBuffer();
  return Buffer.from(arrayBuffer);
}
