import { currentUser, enforceAuthRateLimit } from "@/server/auth";
import { loadLeagueStandings, loadPicks } from "@/server/fplData";
import { effectiveOwnershipSample } from "@/lib/marketLeague";
import type { Pick } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

/** Only post-deadline officially disclosed lineups; bounded sampled EO, not global EO. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leagueId = Number(id);
  const gw = Number(new URL(request.url).searchParams.get("gw"));
  if (!Number.isSafeInteger(leagueId) || leagueId < 1 || !Number.isInteger(gw) || gw < 1 || gw > 38) {
    return Response.json({ error: "Invalid league or gameweek." }, { status: 400 });
  }
  try {
    const user = await currentUser(request);
    if (!user) return Response.json({ error: "Sign in to sample mini-league ownership." }, { status: 401 });
    if (!await enforceAuthRateLimit(request, user.email, "eo-sample", 3)) {
      return Response.json({ error: "Mini-league sampling quota exceeded." }, { status: 429 });
    }
    const league = await loadLeagueStandings(leagueId);
    const entries = league.standings.results.slice(0, 12).map((manager) => manager.entry);
    const publicPicks: (readonly Pick[] | null)[] = [];
    for (let index = 0; index < entries.length; index += 3) {
      const batch = entries.slice(index, index + 3);
      const result = await Promise.all(batch.map(async (entryId) => {
        try { return (await loadPicks(entryId, gw, 300)).picks; }
        catch { return null; }
      }));
      publicPicks.push(...result);
    }
    const cohort = effectiveOwnershipSample(publicPicks);
    return Response.json({ leagueId, gw, sampledEntries: entries.length, ...cohort,
      note: cohort.sampleSize ? "Sample from up to 12 visible public league squads, after gameweek deadline; not representative of all FPL managers." : "No confirmed public picks for this gameweek; do not infer selections." },
    { headers: { "cache-control": "private, max-age=300" } });
  } catch {
    return Response.json({ error: "Ownership sample unavailable." }, { status: 502 });
  }
}
