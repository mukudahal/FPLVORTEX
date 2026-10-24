import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiCache, pricePredictions, priceSnapshots } from "@/db/schema";

export const dynamic = "force-dynamic";

import { getPlayerImageStats } from "@/lib/playerImageResolver";

export interface DataStatusResponse {
  checkedAt: string;
  cacheEntries: {
    key: string;
    fetchedAt: string;
    ageSeconds: number;
  }[];
  solverCacheCount: number;
  latestSolverRun: {
    key: string;
    fetchedAt: string;
    solverEngine: string;
    solverRunMs: number;
    backtestMae: number | null;
    backtestRmse: number | null;
    backtestSample: number | null;
    backtestVerdict: string | null;
  } | null;
  priceModel: {
    snapshotsCount: number;
    correct: number;
    wrong: number;
    pending: number;
    accuracyPct: number | null;
  };
  playerImages: {
    fpl: number;
    fotmob: number;
    placeholder: number;
    noMatch: number;
    totalTracked: number;
    fotmobFallbackEnabled: boolean;
  };
}

export async function GET() {
  try {
    const now = Date.now();
    const rows = await db
      .select({
        key: apiCache.key,
        fetchedAt: apiCache.fetchedAt,
        data: apiCache.data,
      })
      .from(apiCache)
      .orderBy(desc(apiCache.fetchedAt))
      .limit(30);

    const cacheEntries = rows
      .filter((r) => !r.key.startsWith("solver:"))
      .slice(0, 12)
      .map((r) => ({
        key: r.key,
        fetchedAt: r.fetchedAt.toISOString(),
        ageSeconds: Math.max(0, Math.round((now - r.fetchedAt.getTime()) / 1000)),
      }));

    const solverRows = rows.filter((r) => r.key.startsWith("solver:"));
    let latestSolverRun: DataStatusResponse["latestSolverRun"] = null;
    if (solverRows[0]) {
      const d = solverRows[0].data as Record<string, unknown>;
      const bt = (d?.backtest ?? null) as Record<string, unknown> | null;
      latestSolverRun = {
        key: solverRows[0].key,
        fetchedAt: solverRows[0].fetchedAt.toISOString(),
        solverEngine: String(d?.solverEngine ?? "Python PuLP (CBC MILP)"),
        solverRunMs: Number(d?.solverRunMs ?? 0),
        backtestMae: bt ? Number(bt.mae ?? 0) : null,
        backtestRmse: bt ? Number(bt.rmse ?? 0) : null,
        backtestSample: bt ? Number(bt.sampleSize ?? 0) : null,
        backtestVerdict: bt ? String(bt.verdict ?? "") : null,
      };
    }

    const snapCountRows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(priceSnapshots);
    const predCounts = await db
      .select({
        outcome: pricePredictions.outcome,
        n: sql<number>`count(*)::int`,
      })
      .from(pricePredictions)
      .groupBy(pricePredictions.outcome);

    const correct = predCounts.find((c) => c.outcome === "correct")?.n ?? 0;
    const wrong = predCounts.find((c) => c.outcome === "wrong")?.n ?? 0;
    const pending = predCounts.find((c) => c.outcome === "pending")?.n ?? 0;

    const playerImages = await getPlayerImageStats();

    const body: DataStatusResponse = {
      checkedAt: new Date().toISOString(),
      cacheEntries,
      solverCacheCount: solverRows.length,
      latestSolverRun,
      priceModel: {
        snapshotsCount: snapCountRows[0]?.n ?? 0,
        correct,
        wrong,
        pending,
        accuracyPct:
          correct + wrong > 0
            ? Math.round((correct / (correct + wrong)) * 100)
            : null,
      },
      playerImages,
    };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json(
      { error: "Could not load status metrics." },
      { status: 500 },
    );
  }
}
