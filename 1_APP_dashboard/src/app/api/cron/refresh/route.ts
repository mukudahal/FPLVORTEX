import { timingSafeEqual } from "node:crypto";
import { readCronSecret } from "@/lib/runtimeConfig";
import { cacheSet } from "@/lib/fpl";
import { loadRawBootstrap, loadFixtures } from "@/server/fplData";
import { normalizeBootstrap } from "@/lib/fplNormalize";
import { captureOfficialFplSnapshots } from "@/server/snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request, secret: string): boolean {
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A guarded scheduled warm-up; on-demand FPL routes keep a 5-minute TTL. */
export async function GET(request: Request): Promise<Response> {
  const secret = readCronSecret();
  if (!secret) {
    return Response.json({ error: "CRON_SECRET must be configured (16+ characters)." }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [rawBootstrap, fixtures] = await Promise.all([
      loadRawBootstrap(0),
      loadFixtures(0),
    ]);
    const bootstrap = normalizeBootstrap(rawBootstrap);
    if (!Array.isArray(bootstrap.elements) || !Array.isArray(fixtures) || !bootstrap.elements.length) {
      throw new Error("Incomplete FPL data returned by the upstream provider.");
    }
    const snapshots = await captureOfficialFplSnapshots(rawBootstrap, fixtures);
    const result = {
      ok: true,
      refreshedAt: new Date().toISOString(),
      players: bootstrap.elements.length,
      fixtures: fixtures.length,
      snapshotIds: snapshots.map((snapshot) => snapshot.id),
      season: snapshots[0]?.season ?? null,
      nextGameweek: bootstrap.events?.find((event) => event.is_next)?.id ?? null,
    };
    await cacheSet("vortex:automation:last-refresh", result);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[FPL Vortex scheduled refresh failed]", error);
    return Response.json({ ok: false, error: "Data refresh failed." }, { status: 502 });
  }
}
