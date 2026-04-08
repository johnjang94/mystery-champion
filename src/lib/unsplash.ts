import { getKey } from "./keys";

// Fetches a single landscape/square photo URL from Unsplash matching the
// given keyword. Falls back to `null` on any failure so callers can show a
// placeholder rather than crashing the game.
export async function fetchUnsplashImage(keyword: string): Promise<string | null> {
  const accessKey = await getKey("UNSPLASH_ACCESS_KEY");
  if (!accessKey) throw new Error("UNSPLASH_ACCESS_KEY is not set. Configure it in Settings.");

  const url =
    `https://api.unsplash.com/search/photos` +
    `?query=${encodeURIComponent(keyword)}` +
    `&per_page=10&orientation=squarish&content_filter=high`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      "Accept-Version": "v1",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Unsplash error ${res.status}: ${body.slice(0, 200)}`);
  }
  const json: any = await res.json();
  const results: any[] = Array.isArray(json?.results) ? json.results : [];
  if (results.length === 0) return null;
  // Pick a random photo from the top results so repeated keywords don't always
  // resolve to the same image across rooms.
  const pick = results[Math.floor(Math.random() * results.length)];
  return pick?.urls?.regular || pick?.urls?.small || pick?.urls?.full || null;
}

export async function fetchUnsplashImageWithTimeout(
  keyword: string,
  ms: number
): Promise<string | null> {
  return await Promise.race<string | null>([
    fetchUnsplashImage(keyword).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
