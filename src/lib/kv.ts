// Thin wrapper around @vercel/kv. Falls back to an in-memory store when KV
// env vars are missing (useful for `next dev` without a KV instance).
import { kv as vercelKv } from "@vercel/kv";

const haveKv = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// Use globalThis so the map survives Next.js hot-module-replacement in dev.
// Without this, every hot-reload wipes the map and rooms vanish mid-session.
const g = globalThis as any;
if (!g.__mc_kv) g.__mc_kv = new Map<string, string>();
const memory: Map<string, string> = g.__mc_kv;

export const kv = {
  async get<T = unknown>(key: string): Promise<T | null> {
    if (haveKv) return ((await vercelKv.get(key)) as T) ?? null;
    const v = memory.get(key);
    return v ? (JSON.parse(v) as T) : null;
  },
  async set(key: string, value: unknown): Promise<void> {
    if (haveKv) {
      await vercelKv.set(key, value as any);
      return;
    }
    memory.set(key, JSON.stringify(value));
  },
  async del(key: string): Promise<void> {
    if (haveKv) {
      await vercelKv.del(key);
      return;
    }
    memory.delete(key);
  },
  async hgetall<T = Record<string, string>>(key: string): Promise<T | null> {
    if (haveKv) return ((await vercelKv.hgetall(key)) as T) ?? null;
    const v = memory.get(key);
    return v ? (JSON.parse(v) as T) : null;
  },
  async hset(key: string, fields: Record<string, string>): Promise<void> {
    if (haveKv) {
      await vercelKv.hset(key, fields);
      return;
    }
    const cur = memory.get(key);
    const obj = cur ? JSON.parse(cur) : {};
    Object.assign(obj, fields);
    memory.set(key, JSON.stringify(obj));
  },
};

export const isKvBacked = haveKv;
