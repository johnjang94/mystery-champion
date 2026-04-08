import { NextRequest, NextResponse } from "next/server";
import { fetchUnsplashImage } from "@/lib/unsplash";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { keyword, prompt } = await req.json();
    const q = (keyword || prompt || "").toString().trim();
    if (!q) return NextResponse.json({ error: "keyword required" }, { status: 400 });
    const url = await fetchUnsplashImage(q);
    if (!url) return NextResponse.json({ error: "No Unsplash result" }, { status: 502 });
    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
