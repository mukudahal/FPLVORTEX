/**
 * Official Premier League player-photo URLs.
 *
 * Two layouts exist on resources.premierleague.com:
 *   - season folders:  /premierleague25/photos/players/110x140/{code}.png
 *   - legacy folder:   /premierleague/photos/players/110x140/p{code}.png
 *
 * Neither is complete (new signings and some promoted-club players only exist
 * in one), so we try the current season folder first and the legacy path second.
 *
 * The season folder is discovered from live data instead of hard-coded: we probe
 * candidate folders with the most-owned players (who always have photos) and
 * remember whichever answers. A season rollover therefore can't silently break
 * every photo.
 */

const ORIGIN = "https://resources.premierleague.com";
const MIN_IMAGE_BYTES = 500;

const FOLDER_TTL_FOUND_MS = 12 * 60 * 60 * 1000;
const FOLDER_TTL_MISSING_MS = 10 * 60 * 1000;

export function seasonPhotoUrl(folder: string, code: number): string {
  return `${ORIGIN}/${folder}/photos/players/110x140/${code}.png`;
}

export function legacyPhotoUrl(code: number): string {
  return `${ORIGIN}/premierleague/photos/players/110x140/p${code}.png`;
}

/**
 * Candidate season folders, newest first. Folders are named for the season's
 * start year (premierleague25 = 2025/26) and the new one may appear a little
 * before or after the season starts, so we check one ahead and one behind.
 */
export function seasonFolderCandidates(now: Date = new Date()): string[] {
  const year = now.getUTCFullYear();
  const seasonStart = now.getUTCMonth() >= 6 ? year : year - 1; // season starts ~August
  return [seasonStart + 1, seasonStart, seasonStart - 1].map(
    (y) => `premierleague${String(y % 100).padStart(2, "0")}`,
  );
}

/** GET an image URL; returns the bytes only for a real image (not an error page or stub). */
export async function fetchImageBuffer(
  url: string,
  userAgent: string,
  timeoutMs = 3000,
): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") || "").includes("image")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length >= MIN_IMAGE_BYTES ? buf : null;
  } catch {
    return null;
  }
}

let folderCache: { folder: string | null; expiresAt: number } | null = null;
let inFlight: Promise<string | null> | null = null;

/**
 * Find the season folder that is currently serving photos, or null if none
 * answers. Cached; concurrent callers share one probe.
 */
export function getSeasonFolder(
  getProbeCodes: () => Promise<number[]>,
  userAgent: string,
): Promise<string | null> {
  if (folderCache && folderCache.expiresAt > Date.now()) {
    return Promise.resolve(folderCache.folder);
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let found: string | null = null;
    const probeCodes = await getProbeCodes();
    for (const folder of probeCodes.length ? seasonFolderCandidates() : []) {
      const results = await Promise.all(
        probeCodes.map((code) => fetchImageBuffer(seasonPhotoUrl(folder, code), userAgent, 4000)),
      );
      if (results.some(Boolean)) {
        found = folder;
        break;
      }
    }
    folderCache = {
      folder: found,
      expiresAt: Date.now() + (found ? FOLDER_TTL_FOUND_MS : FOLDER_TTL_MISSING_MS),
    };
    return found;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
