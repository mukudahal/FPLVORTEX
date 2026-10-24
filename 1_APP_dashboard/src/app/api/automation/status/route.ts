import { cacheGet } from "@/lib/fpl";
import { readCronSecret } from "@/lib/runtimeConfig";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const result = await cacheGet<{ ok: boolean; refreshedAt: string; players: number; fixtures: number; nextGameweek: number | null }>(
    "vortex:automation:last-refresh",
    60 * 60 * 48,
  );
  const lastLive = await cacheGet<{ refreshedAt: string; gameweek: number; players: number; snapshotId: string }>(
    "vortex:automation:last-live", 60 * 60 * 48,
  );
  return Response.json(
    { configured: Boolean(readCronSecret()), lastRefresh: result, lastLive },
    { headers: { "cache-control": "no-store" } },
  );
}
