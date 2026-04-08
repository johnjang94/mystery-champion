import { NextRequest, NextResponse } from "next/server";
import { fetchUnsplashImage } from "@/lib/unsplash";
import { getRoom, updatePhotoImage } from "@/lib/rooms";
import { pushState } from "@/lib/pusher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { code, photoIndex } = await req.json();
    const idx = Number(photoIndex);
    if (!code || isNaN(idx))
      return NextResponse.json({ error: "code + photoIndex required" }, { status: 400 });

    const upper = String(code).toUpperCase();
    const room = await getRoom(upper);
    if (!room?.scenario)
      return NextResponse.json({ error: "Room or scenario not found" }, { status: 404 });

    const photo = room.scenario.photos[idx];
    if (!photo)
      return NextResponse.json({ error: "Photo index out of range" }, { status: 400 });

    // Skip if already fetched (e.g. client retried).
    if (photo.imageUrl)
      return NextResponse.json({ imageUrl: photo.imageUrl });

    const imageUrl = await fetchUnsplashImage(photo.keyword);
    if (!imageUrl)
      return NextResponse.json({ error: "No Unsplash result for keyword" }, { status: 502 });

    const updated = await updatePhotoImage(upper, idx, imageUrl);
    if (updated) await pushState(upper, updated);

    return NextResponse.json({ imageUrl });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
