"use client";

import { Card, ErrorBox, Pill, Spinner } from "@/components/ui";
import { useJson } from "@/lib/useJson";
import type { DataStatusResponse } from "@/app/api/status/route";
import type { OptimizerResponse } from "@/lib/types";

export function DataModelStatus({
  optimizer,
}: {
  optimizer?: OptimizerResponse | null;
}) {
  const { data, error, loading, refresh } = useJson<DataStatusResponse>(
    "/api/status",
    30_000,
  );

  if (loading && !data) return <Spinner label="Checking data & solver status…" />;
  if (error && !data) return <ErrorBox message={error} onRetry={refresh} />;
  if (!data) return null;

  const bt = optimizer?.backtest ?? null;
  const solverMs = optimizer?.solverRunMs ?? data.latestSolverRun?.solverRunMs ?? null;
  const solverEngine =
    optimizer?.solverEngine ??
    data.latestSolverRun?.solverEngine ??
    "Python PuLP (CBC MILP)";
  const mae = bt?.mae ?? data.latestSolverRun?.backtestMae ?? null;
  const rmse = bt?.rmse ?? data.latestSolverRun?.backtestRmse ?? null;
  const sample = bt?.sampleSize ?? data.latestSolverRun?.backtestSample ?? null;
  const verdict = bt?.verdict ?? data.latestSolverRun?.backtestVerdict ?? null;

  return (
    <div className="flex flex-col gap-3">
      {/* Solver & Model Accuracy */}
      <Card className="!p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Optimizer &amp; Core Engine
            </p>
            <h2 className="text-base font-extrabold text-white">
              {solverEngine}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {solverMs !== null ? (
              <Pill className="bg-[#84d21c]/15 text-[#84d21c]">
                Solve time: {solverMs} ms
              </Pill>
            ) : null}
            <Pill className="bg-white/10 text-slate-300">
              {data.solverCacheCount} cached plans
            </Pill>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-white/[0.04] p-2">
            <span className="text-[9px] uppercase text-slate-400">
              xPts Backtest MAE
            </span>
            <p className="text-base font-extrabold text-[#84d21c]">
              {mae !== null ? `${mae.toFixed(2)} pts` : "Run team first"}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-2">
            <span className="text-[9px] uppercase text-slate-400">
              Backtest RMSE
            </span>
            <p className="text-base font-extrabold text-white">
              {rmse !== null ? `${rmse.toFixed(2)} pts` : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-2">
            <span className="text-[9px] uppercase text-slate-400">
              Sample Size
            </span>
            <p className="text-base font-extrabold text-slate-200">
              {sample !== null ? `${sample} player-GWs` : "—"}
            </p>
          </div>
        </div>

        {verdict ? (
          <p className="mt-2 rounded-lg bg-white/[0.04] p-2 text-xs text-slate-300">
            {verdict}
          </p>
        ) : null}
      </Card>

      {/* Price Model Accuracy */}
      <Card className="!p-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Price Watch Model Status
            </p>
            <p className="text-base font-extrabold text-white">
              Accuracy:{" "}
              <span className="text-[#84d21c]">
                {data.priceModel.accuracyPct !== null
                  ? `${data.priceModel.accuracyPct}%`
                  : "Calibrating"}
              </span>
            </p>
          </div>
          <Pill className="bg-white/10 text-slate-300">
            {data.priceModel.snapshotsCount} DB snapshots
          </Pill>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Resolved predictions: {data.priceModel.correct} correct ·{" "}
          {data.priceModel.wrong} wrong · {data.priceModel.pending} pending
          (30-hour evaluation window).
        </p>
      </Card>

      {/* Dev-only: Player Image Resolution Fallback Stats (Update 4) */}
      <Card className="!p-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Player Image Fallback Engine (Update 4 Dev Status)
            </p>
            <p className="text-sm font-extrabold text-white">
              Source: FPL Photo (season + legacy) → FotMob Headshot → Silhouette + Badge
            </p>
          </div>
          <Pill
            className={
              data.playerImages?.fotmobFallbackEnabled
                ? "bg-[#84d21c]/15 text-[#84d21c]"
                : "bg-amber-400/20 text-amber-200"
            }
          >
            FOTMOB_FALLBACK: {data.playerImages?.fotmobFallbackEnabled ? "ON" : "OFF"}
          </Pill>
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-2 text-center text-xs">
          <div className="rounded-xl bg-white/[0.04] p-2">
            <span className="text-[9px] uppercase text-slate-400">1. FPL Photo</span>
            <p className="text-sm font-extrabold text-[#84d21c]">
              {data.playerImages?.fpl ?? 0}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-2">
            <span className="text-[9px] uppercase text-slate-400">2. FotMob</span>
            <p className="text-sm font-extrabold text-sky-400">
              {data.playerImages?.fotmob ?? 0}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-2">
            <span className="text-[9px] uppercase text-slate-400">3. Placeholder</span>
            <p className="text-sm font-extrabold text-amber-300">
              {data.playerImages?.placeholder ?? 0}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-2">
            <span className="text-[9px] uppercase text-slate-400">No Match</span>
            <p className="text-sm font-extrabold text-slate-300">
              {data.playerImages?.noMatch ?? 0}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          Resolved photos are cached on disk for 7 days (placeholders retry daily) in a 110:140 box. FotMob mapping retries no_match rows after 7 days.
        </p>
      </Card>

      {/* Data Freshness Table */}
      <Card className="!p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
            FPL API Cache &amp; Data Freshness
          </p>
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-bold text-slate-200 hover:bg-white/20"
          >
            Refresh
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {data.cacheEntries.map((c) => (
            <div
              key={c.key}
              className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs"
            >
              <span className="truncate font-mono text-[11px] text-slate-200">
                {c.key}
              </span>
              <span
                className={`shrink-0 text-[10px] font-bold ${
                  c.ageSeconds < 120
                    ? "text-[#84d21c]"
                    : c.ageSeconds < 600
                      ? "text-amber-300"
                      : "text-slate-400"
                }`}
              >
                {c.ageSeconds < 60
                  ? `${c.ageSeconds}s ago`
                  : `${Math.round(c.ageSeconds / 60)}m ago`}
              </span>
            </div>
          ))}
          {data.cacheEntries.length === 0 ? (
            <p className="text-xs text-slate-500">No cached endpoints yet.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
