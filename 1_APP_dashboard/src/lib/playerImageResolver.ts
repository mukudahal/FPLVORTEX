import { db } from "@/db";
import { fotmobMappings, playerImageResolutions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import sharp from "sharp";
import { clubsMatch, normalizeString } from "./clubMatch";
import { loadBootstrap } from "@/server/fplData";
import { teamBadgeUrl } from "./helpers";
import {
  fetchImageBuffer,
  getSeasonFolder,
  legacyPhotoUrl,
  seasonFolderCandidates,
  seasonPhotoUrl,
} from "./playerPhotoPaths";
import type { SlimBootstrap, SlimElement, SlimTeam } from "./types";

export { normalizeString };

const USER_AGENT = "FPL-Vortex/1.0 (image-resolver; contact: local)";
const CACHE_DIR = path.join(process.cwd(), ".cache", "player-images");

// Ensure cache directory exists
if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

/** Check if player name matches FotMob candidate text */
function namesMatch(fplPlayer: SlimElement, candidateText: string): boolean {
  const normCand = normalizeString(candidateText.split("|")[0]);
  const fullName = normalizeString(`${fplPlayer.first_name} ${fplPlayer.second_name}`);
  const webName = normalizeString(fplPlayer.web_name);
  const secondName = normalizeString(fplPlayer.second_name);

  if (normCand === fullName) return true;
  if (normCand.includes(secondName) && (normCand.includes(webName) || fullName.includes(normCand))) {
    return true;
  }
  // Check token overlap
  const candTokens = normCand.split(" ");
  const nameTokens = fullName.split(" ");
  const overlap = candTokens.filter((t) => t.length > 2 && nameTokens.includes(t));
  return overlap.length >= 2 || (candTokens.includes(secondName) && secondName.length > 3);
}

/** "placeholder" = neutral silhouette (+ club badge). Shirts are intentionally never used. */
export type ImageSource = "fpl" | "fotmob" | "placeholder";

export interface ResolvedImageResult {
  source: ImageSource;
  buffer: Buffer;
  fotmobId?: number | null;
}

/** Fetch bootstrap data to access player and team info by code */
async function getPlayerAndTeam(code: number): Promise<{ player: SlimElement; team: SlimTeam } | null> {
  try {
    const raw = await loadBootstrap();
    const player = raw.elements.find((e) => e.code === code);
    if (!player) return null;
    const team = raw.teams.find((t) => t.id === player.team);
    if (!team) return null;
    return { player, team };
  } catch {
    return null;
  }
}

/** The most-owned players: reliable probes for "is this photo folder live?". */
async function getProbeCodes(): Promise<number[]> {
  try {
    const raw = await loadBootstrap();
    return [...raw.elements]
      .sort((a, b) => Number(b.selected_by_percent) - Number(a.selected_by_percent))
      .slice(0, 5)
      .map((e) => e.code);
  } catch {
    return [];
  }
}

/**
 * 1. Official FPL photo
 * Tries the live season folder (discovered, not hard-coded), then the legacy
 * folder that still holds players the season folder is missing.
 * Returns a 110x140 PNG, or null if neither has a real photo.
 */
async function tryFplPhoto(code: number): Promise<Buffer | null> {
  const folder = await getSeasonFolder(getProbeCodes, USER_AGENT);
  const urls = [
    ...(folder
      ? [seasonPhotoUrl(folder, code)]
      : seasonFolderCandidates().map((f) => seasonPhotoUrl(f, code))),
    legacyPhotoUrl(code),
  ];

  for (const url of urls) {
    const raw = await fetchImageBuffer(url, USER_AGENT);
    if (!raw) continue;
    try {
      return await sharp(raw).resize(110, 140, { fit: "cover", position: "top" }).png().toBuffer();
    } catch {
      // Corrupt image: try the next source.
    }
  }
  return null;
}

/**
 * 2. FotMob Headshot
 * Looks up/searches FotMob ID, verifies against club, and returns 110x140 image buffer.
 */
async function tryFotmobHeadshot(
  player: SlimElement,
  team: SlimTeam,
): Promise<{ buffer: Buffer; fotmobId: number } | null> {
  if (process.env.FOTMOB_FALLBACK === "off") {
    return null;
  }

  const code = player.code;

  // Check database mapping first
  let fotmobId: number | null = null;
  try {
    const rows = await db
      .select()
      .from(fotmobMappings)
      .where(eq(fotmobMappings.fplPlayerCode, code))
      .limit(1);

    const mapping = rows[0];
    if (mapping) {
      const now = Date.now();
      const ageDays = (now - mapping.matchedAt.getTime()) / (1000 * 3600 * 24);
      if (mapping.status === "matched" && mapping.fotmobId) {
        fotmobId = mapping.fotmobId;
      } else if (mapping.status === "no_match" && ageDays < 7) {
        // Skip FotMob if checked as no_match within the last 7 days
        return null;
      }
    }
  } catch (err) {
    console.error(`[FPL Vortex FotMob DB read error for player code ${code}]`, err);
  }

  // If not mapped yet or retry period elapsed, query FotMob search
  if (!fotmobId) {
    try {
      const queryNames = [
        `${player.first_name} ${player.second_name}`.trim(),
        `${player.first_name} ${player.web_name}`.trim(),
        player.web_name.trim(),
      ];
      // Deduplicate queries
      const uniqueQueries = [...new Set(queryNames)];

      let verifiedCandidateId: number | null = null;

      for (const qName of uniqueQueries) {
        if (verifiedCandidateId) break;
        const searchUrl = `https://apigw.fotmob.com/searchapi/suggest?term=${encodeURIComponent(qName)}`;
        const res = await fetch(searchUrl, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(3000),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            squadMemberSuggest?: {
              options?: {
                text?: string;
                payload?: { teamName?: string; id?: string };
              }[];
            }[];
          };

          const options = (data.squadMemberSuggest || []).flatMap((s) => s.options || []);
          let matchCount = 0;
          let candidateId: number | null = null;

          for (const opt of options) {
            const text = opt.text || "";
            const payloadTeam = opt.payload?.teamName || "";
            if (namesMatch(player, text) && clubsMatch(team.name, payloadTeam)) {
              const idPart = text.split("|")[1] || opt.payload?.id;
              const parsedId = Number(idPart);
              if (Number.isInteger(parsedId) && parsedId > 0) {
                candidateId = parsedId;
                matchCount++;
              }
            }
          }

          if (candidateId && matchCount === 1) {
            verifiedCandidateId = candidateId;
          }
        }
      }

      // Only accept if exactly 1 confident match (rule: a wrong face is worse than a placeholder)
      if (verifiedCandidateId) {
        fotmobId = verifiedCandidateId;
        try {
          await db
            .insert(fotmobMappings)
            .values({
              fplPlayerCode: code,
              fotmobId: verifiedCandidateId,
              status: "matched",
              matchedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: fotmobMappings.fplPlayerCode,
              set: {
                fotmobId: verifiedCandidateId,
                status: "matched",
                matchedAt: new Date(),
              },
            });
        } catch (dbErr) {
          console.error(`[FPL Vortex FotMob DB save error for player code ${code}]`, dbErr);
        }
      } else {
        // Record no_match
        try {
          await db
            .insert(fotmobMappings)
            .values({
              fplPlayerCode: code,
              fotmobId: null,
              status: "no_match",
              matchedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: fotmobMappings.fplPlayerCode,
              set: {
                fotmobId: null,
                status: "no_match",
                matchedAt: new Date(),
              },
            });
        } catch (dbErr) {
          console.error(`[FPL Vortex FotMob DB no_match save error for ${code}]`, dbErr);
        }
        return null;
      }
    } catch (err) {
      console.error(`[FPL Vortex FotMob search exception for code ${code}]`, err);
      return null;
    }
  }

  if (!fotmobId) return null;

  // Fetch headshot image from FotMob
  try {
    const imgUrl = `https://images.fotmob.com/image_resources/playerimages/${fotmobId}.png`;
    const res = await fetch(imgUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("image")) return null;

    const rawBuffer = Buffer.from(await res.arrayBuffer());
    if (rawBuffer.length < 500) return null;

    // Use object-fit: cover with object-position: top center inside the 110x140 frame
    const processed = await sharp(rawBuffer)
      .resize(110, 140, {
        fit: "cover",
        position: "top",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    return { buffer: processed, fotmobId };
  } catch (err) {
    console.error(`[FPL Vortex FotMob image fetch error for ID ${fotmobId}]`, err);
    return null;
  }
}

const SILHOUETTE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="110" height="140" viewBox="0 0 110 140">' +
  '<circle cx="55" cy="48" r="26" fill="#475569"/>' +
  '<path d="M13 140c0-30 19-48 42-48s42 18 42 48Z" fill="#475569"/></svg>';

/**
 * 3. Placeholder (last resort): neutral silhouette with the club badge on the chest.
 * Same silhouette the client draws when an image fails, so the UI looks consistent.
 * Never a shirt/kit image.
 */
async function buildPlaceholder(team: SlimTeam | null): Promise<Buffer> {
  const silhouette = () => sharp(Buffer.from(SILHOUETTE_SVG));

  if (team) {
    const badge = await fetchImageBuffer(teamBadgeUrl(team.code), USER_AGENT);
    if (badge) {
      try {
        const badgePng = await sharp(badge)
          .resize(44, 44, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        return await silhouette()
          .composite([{ input: badgePng, left: 33, top: 92 }])
          .png()
          .toBuffer();
      } catch {
        // Fall through to the plain silhouette.
      }
    }
  }
  return silhouette().png().toBuffer();
}

const CACHE_FRESH_DAYS: Record<ImageSource, number> = {
  fpl: 7,
  fotmob: 7,
  // Placeholders are retried daily so a player who gains a photo is picked up quickly.
  placeholder: 1,
};

async function recordResolution(code: number, source: ImageSource, fotmobId?: number | null) {
  await db
    .insert(playerImageResolutions)
    .values({ fplPlayerCode: code, source, fotmobId: fotmobId ?? null, resolvedAt: new Date() })
    .onConflictDoUpdate({
      target: playerImageResolutions.fplPlayerCode,
      set: { source, fotmobId: fotmobId ?? null, resolvedAt: new Date() },
    });
}

/**
 * Resolve player image: official FPL photo -> FotMob headshot -> silhouette + badge.
 * Saves to disk cache and logs to database.
 */
export async function resolvePlayerImage(code: number): Promise<ResolvedImageResult> {
  const cacheFile = path.join(CACHE_DIR, `${code}.png`);

  // Disk cache
  if (existsSync(cacheFile)) {
    try {
      const ageDays = (Date.now() - statSync(cacheFile).mtimeMs) / (1000 * 3600 * 24);
      if (ageDays < 7) {
        const rows = await db
          .select({ source: playerImageResolutions.source, fotmobId: playerImageResolutions.fotmobId })
          .from(playerImageResolutions)
          .where(eq(playerImageResolutions.fplPlayerCode, code))
          .limit(1);
        const recorded = rows[0]?.source;
        // Rows saved before shirts were removed say "shirt". Never serve those cached kits.
        if (recorded !== "shirt") {
          const source = (recorded as ImageSource) || "fpl";
          if (ageDays < (CACHE_FRESH_DAYS[source] ?? 7)) {
            return { source, buffer: readFileSync(cacheFile), fotmobId: rows[0]?.fotmobId };
          }
        }
      }
    } catch {
      // Continue to re-resolve if cache read fails
    }
  }

  // 1. Official FPL photo (season folder, then legacy folder)
  const fplBuffer = await tryFplPhoto(code);
  if (fplBuffer) {
    try {
      writeFileSync(cacheFile, fplBuffer);
      await recordResolution(code, "fpl");
    } catch {}
    return { source: "fpl", buffer: fplBuffer };
  }

  // Look up player details for the FotMob fallback and the badge
  const pt = await getPlayerAndTeam(code);
  if (!pt) {
    // Player not in bootstrap: plain silhouette, not cached.
    return { source: "placeholder", buffer: await buildPlaceholder(null) };
  }

  // 2. FotMob headshot
  const fotmobResult = await tryFotmobHeadshot(pt.player, pt.team);
  if (fotmobResult) {
    try {
      writeFileSync(cacheFile, fotmobResult.buffer);
      await recordResolution(code, "fotmob", fotmobResult.fotmobId);
    } catch {}
    return { source: "fotmob", buffer: fotmobResult.buffer, fotmobId: fotmobResult.fotmobId };
  }

  // 3. Silhouette + club badge
  const placeholder = await buildPlaceholder(pt.team);
  try {
    writeFileSync(cacheFile, placeholder);
    await recordResolution(code, "placeholder");
  } catch {}
  return { source: "placeholder", buffer: placeholder };
}

/** Dev status stats for /status */
export async function getPlayerImageStats() {
  try {
    const resolutions = await db.select().from(playerImageResolutions);
    const mappings = await db.select().from(fotmobMappings);

    let fplCount = 0;
    let fotmobCount = 0;
    let placeholderCount = 0;

    for (const r of resolutions) {
      if (r.source === "fpl") fplCount++;
      else if (r.source === "fotmob") fotmobCount++;
      else if (r.source === "placeholder") placeholderCount++;
    }

    const noMatchCount = mappings.filter((m) => m.status === "no_match").length;
    return {
      fpl: fplCount,
      fotmob: fotmobCount,
      placeholder: placeholderCount,
      noMatch: noMatchCount,
      totalTracked: resolutions.length,
      fotmobFallbackEnabled: process.env.FOTMOB_FALLBACK !== "off",
    };
  } catch {
    return {
      fpl: 0,
      fotmob: 0,
      placeholder: 0,
      noMatch: 0,
      totalTracked: 0,
      fotmobFallbackEnabled: process.env.FOTMOB_FALLBACK !== "off",
    };
  }
}
