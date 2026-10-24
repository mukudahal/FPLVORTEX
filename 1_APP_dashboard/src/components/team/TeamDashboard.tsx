"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, ErrorBox, Pill, Spinner, StatBox } from "@/components/ui";
import { HistoryView } from "@/components/team/HistoryView";
import { TransfersView } from "@/components/team/TransfersView";
import { AnalysisLiveView } from "@/components/team/AnalysisLiveView";
import { ExplainView } from "@/components/team/ExplainView";
import { PriceView } from "@/components/team/PriceView";
import { NewsView } from "@/components/team/NewsView";
import { MatchesView } from "@/components/team/MatchesView";
import { ChipsView } from "@/components/team/ChipsView";
import { RivalsView } from "@/components/team/RivalsView";
import { VerdictView } from "@/components/team/VerdictView";
import { AutoOptimizedView } from "@/components/team/AutoOptimizedView";
import { TeamPlanner } from "@/components/planner/TeamPlanner";
import { CopilotChat } from "@/components/team/CopilotChat";
import { DataModelStatus } from "@/components/DataModelStatus";
import { TabErrorBoundary, VerdictSkeleton } from "@/components/ErrorBoundary";
import { useJson } from "@/lib/useJson";
import { chipLabel, formatRank, saveTeamId } from "@/lib/helpers";
import type {
  EntryResponse,
  Fixture,
  LiveResponse,
  OptimizerResponse,
  PicksResponse,
  SlimBootstrap,
} from "@/lib/types";

type Tab =
  | "analysis"
  | "live"
  | "match"
  | "chips"
  | "rivals"
  | "verdict"
  | "auto"
  | "planner"
  | "season"
  | "transfers"
  | "copilot"
  | "status";

// Analysis Live includes the former Review pitch, stats and hindsight details.
const TABS: [Tab, string][] = [
  ["analysis", "Analysis Live"],
  ["live", "Market & Fitness"],
  ["match", "Match"],
  ["chips", "Chips"],
  ["rivals", "Rivals"],
  ["verdict", "Verdict"],
  ["auto", "Auto Optimized"],
  ["planner", "Planner"],
  ["season", "Season"],
  ["transfers", "Transfers"],
  ["copilot", "Copilot 🏆"],
  ["status", "Data & Model Status"],
];

export function TeamDashboard({ teamId, initialGw, initialTab }: { teamId: string; initialGw?: number; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>(
    TABS.some(([key]) => key === initialTab) ? initialTab as Tab : initialTab === "market" ? "live" : "analysis",
  );
  const [selectedGw, setViewGw] = useState<number | null>(null);
  const [horizon, setHorizon] = useState<number>(5);

  const bootstrap = useJson<SlimBootstrap>("/api/fpl/bootstrap", 300_000);
  const entry = useJson<EntryResponse>(`/api/fpl/entry/${teamId}`, 120_000);
  const fixtures = useJson<Fixture[]>("/api/fpl/fixtures", 60_000);
  const optimizer = useJson<OptimizerResponse>(
    `/api/optimizer/${teamId}?horizon=${horizon}`,
    180_000,
  );

  const currentGw =
    entry.data?.entry.current_event ?? bootstrap.data?.currentEvent ?? null;
  const viewGw = selectedGw ?? (currentGw && initialGw && initialGw >= (entry.data?.entry.started_event ?? 1) && initialGw <= currentGw ? initialGw : currentGw);
  const nextGw = useMemo(() => {
    const n = bootstrap.data?.nextEvent ?? null;
    if (n) return n;
    return currentGw && currentGw < 38 ? currentGw + 1 : currentGw;
  }, [bootstrap.data, currentGw]);


  useEffect(() => {
    if (entry.data) saveTeamId(teamId);
  }, [entry.data, teamId]);

  const gwEvent = useMemo(
    () => bootstrap.data?.events.find((e) => e.id === viewGw) ?? null,
    [bootstrap.data, viewGw],
  );
  const isLiveGw =
    viewGw !== null &&
    viewGw === currentGw &&
    gwEvent !== null &&
    !gwEvent.finished;

  const picks = useJson<PicksResponse>(
    viewGw ? `/api/fpl/entry/${teamId}/picks/${viewGw}` : null,
    isLiveGw ? 60_000 : 0,
  );
  const curPicks = useJson<PicksResponse>(
    currentGw ? `/api/fpl/entry/${teamId}/picks/${currentGw}` : null,
  );
  const live = useJson<LiveResponse>(
    viewGw ? `/api/fpl/live/${viewGw}` : null,
    isLiveGw ? 60_000 : 0,
  );

  const liveMap = useMemo(() => {
    const m = new Map<number, LiveResponse["elements"][number]["stats"]>();
    live.data?.elements.forEach((e) => m.set(e.id, e.stats));
    return m;
  }, [live.data]);

  const elementsMap = useMemo(() => {
    const m = new Map<number, SlimBootstrap["elements"][number]>();
    bootstrap.data?.elements.forEach((e) => m.set(e.id, e));
    return m;
  }, [bootstrap.data]);

  const teamsMap = useMemo(() => {
    const m = new Map<number, SlimBootstrap["teams"][number]>();
    bootstrap.data?.teams.forEach((t) => m.set(t.id, t));
    return m;
  }, [bootstrap.data]);

  const gwFixtures = useMemo(
    () => (fixtures.data ?? []).filter((f) => f.event === viewGw),
    [fixtures.data, viewGw],
  );

  const effectiveCurPicks =
    curPicks.data ??
    (viewGw === currentGw ? picks.data : null) ??
    optimizer.data?.currentPicks ??
    picks.data ??
    null;

  const squadIds = useMemo(
    () =>
      (effectiveCurPicks?.picks ?? []).length > 0
        ? (effectiveCurPicks?.picks ?? []).map((p) => p.element)
        : (optimizer.data?.optimizedNextGw?.squad ?? []),
    [effectiveCurPicks, optimizer.data],
  );
  const squadElements = useMemo(
    () =>
      squadIds
        .map((id) => elementsMap.get(id))
        .filter((e): e is NonNullable<typeof e> => !!e),
    [squadIds, elementsMap],
  );
  const squadTeamIds = useMemo(
    () => new Set(squadElements.map((e) => e.team)),
    [squadElements],
  );

  const livePoints = useMemo(() => {
    if (!picks.data) return null;
    let total = 0;
    for (const p of picks.data.picks) {
      const stats = liveMap.get(p.element);
      if (stats) total += stats.total_points * p.multiplier;
    }
    return total - picks.data.entry_history.event_transfers_cost;
  }, [picks.data, liveMap]);

  if ((entry.loading && !entry.data) || (bootstrap.loading && !bootstrap.data)) {
    return <Spinner label="Loading team…" />;
  }
  if (entry.error || !entry.data) {
    return (
      <div className="pt-10">
        <ErrorBox
          message={entry.error ?? "Could not load this team."}
          onRetry={entry.refresh}
        />
        <p className="text-center text-sm">
          <Link href="/" className="text-[#84d21c] underline">
            ← Try a different Team ID
          </Link>
        </p>
      </div>
    );
  }
  if (!bootstrap.data) {
    return (
      <ErrorBox
        message={bootstrap.error ?? "Could not load FPL data."}
        onRetry={bootstrap.refresh}
      />
    );
  }

  const e = entry.data.entry;
  const eh = picks.data?.entry_history;
  const shownPoints = isLiveGw && livePoints !== null ? livePoints : eh?.points;
  const activeChip = chipLabel(picks.data?.active_chip);

  return (
    <main className="px-3 pt-5">
      {/* Header */}
      <header className="mb-4 px-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight">
              {e.name}
            </h1>
            <p className="truncate text-sm text-slate-400">
              {e.player_first_name} {e.player_last_name} · #{e.id}
              {e.player_region_name ? ` · ${e.player_region_name}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {isLiveGw ? (
              <Pill className="bg-[#84d21c]/15 text-[#84d21c]">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#84d21c]" />
                LIVE
              </Pill>
            ) : null}
            <button
              type="button"
              onClick={() => setTab("status")}
              className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-slate-300 hover:bg-white/10"
              title="Data freshness, model accuracy & solver run time"
            >
              {optimizer.data
                ? `MAE ${optimizer.data.backtest.mae} · ${optimizer.data.solverRunMs}ms`
                : "Model Status"}
            </button>
          </div>
        </div>

        {tab !== "analysis" && tab !== "live" ? <div className="mt-3 grid grid-cols-3 gap-2">
          <StatBox
            label={`GW${viewGw ?? "?"} Points`}
            value={shownPoints ?? "—"}
            accent
            sub={
              eh && eh.event_transfers_cost > 0
                ? `-${eh.event_transfers_cost} hits`
                : gwEvent?.average_entry_score
                  ? `Avg ${gwEvent.average_entry_score}`
                  : undefined
            }
          />
          <StatBox
            label="Total"
            value={e.summary_overall_points ?? "—"}
            sub={`GW rank ${formatRank(e.summary_event_rank)}`}
          />
          <StatBox
            label="Overall Rank"
            value={formatRank(e.summary_overall_rank)}
            sub={
              eh
                ? `Team £${(eh.value / 10).toFixed(1)}m · Bank £${(eh.bank / 10).toFixed(1)}m`
                : undefined
            }
          />
        </div> : null}

        {activeChip && tab !== "analysis" ? (
          <div className="mt-2">
            <Pill className="bg-fuchsia-500/20 text-fuchsia-200">
              ★ {activeChip} active
            </Pill>
          </div>
        ) : null}
      </header>

      {/* Scrollable Tab Bar */}
      <div className="-mx-3 mb-4 overflow-x-auto px-3 pb-1">
        <div className="flex w-max gap-1.5">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition ${
                tab === key
                  ? "bg-gradient-to-r from-[#cda228] to-[#84d21c] text-[#000000] shadow-md shadow-[#cda228]/20"
                  : "border border-white/10 bg-white/[0.04] text-slate-300 hover:border-[#cda228]/40 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "analysis" ? (
        !picks.data || !live.data || !fixtures.data ? (
          picks.error || live.error || fixtures.error ? <ErrorBox message={picks.error ?? live.error ?? fixtures.error ?? "Live analysis unavailable."} onRetry={() => { picks.refresh(); live.refresh(); fixtures.refresh(); }} /> : <Spinner label="Loading live analysis…" />
        ) : (
          <>
            {live.error || fixtures.error ? <p role="status" className="mb-3 text-sm text-amber-300">Live refresh failed. Showing the last received data. <button type="button" className="underline" onClick={() => { live.refresh(); fixtures.refresh(); }}>Retry</button></p> : null}
            <AnalysisLiveView
              key={teamId}
              teamId={teamId}
              gw={viewGw ?? currentGw ?? 1}
              entry={entry.data}
              bootstrap={bootstrap.data}
              picks={picks.data}
              live={live.data}
              fixtures={gwFixtures}
              lastUpdated={live.lastUpdated}
              reviewDetails={<ExplainView
                gw={viewGw ?? currentGw ?? 1}
                picks={picks.data}
                elements={bootstrap.data.elements}
                elementsMap={elementsMap}
                teamsMap={teamsMap}
                liveMap={liveMap}
                gwFixtures={gwFixtures}
                sellingPrices={optimizer.data?.sellingPrices}
              />}
              onPrevious={() => setViewGw(viewGw && viewGw > (e.started_event ?? 1) ? viewGw - 1 : viewGw)}
              onNext={() => setViewGw(viewGw && currentGw && viewGw < currentGw ? viewGw + 1 : viewGw)}
              canPrevious={Boolean(viewGw && viewGw > (e.started_event ?? 1))}
              canNext={Boolean(viewGw && currentGw && viewGw < currentGw)}
            />
          </>
        )
      ) : null}

      {tab === "live" ? (
        <div className="market-fitness">
          <header className="market-toolbar"><div><span className="market-kicker">Your transfer desk</span><h1>Market &amp; Fitness</h1><p>Price movement, transfer momentum and availability in one place.</p></div><div className="market-sync"><span>Auto refresh · 5 min</span><small>{bootstrap.lastUpdated ? `Checked ${bootstrap.lastUpdated.toLocaleTimeString()}` : "Connecting…"}</small><button onClick={bootstrap.refresh} disabled={bootstrap.loading}>{bootstrap.loading ? "Refreshing…" : "Refresh ↻"}</button></div></header>
          {bootstrap.error ? <p role="alert" className="market-warning">Could not refresh. Showing the last available snapshot. <button onClick={bootstrap.refresh}>Try again</button></p> : null}
          <div className="market-layout">
            <PriceView squadIds={squadIds} elements={bootstrap.data.elements} teamsMap={teamsMap} purchasePrices={optimizer.data?.purchasePrices} sellingPrices={optimizer.data?.sellingPrices}/>
            <NewsView elements={bootstrap.data.elements} teamsMap={teamsMap} squadIds={squadIds} fixtures={fixtures.data}/>
          </div>
        </div>
      ) : null}

      {/* SECTION 5 (Phase 5): MATCH TAB */}
      {tab === "match" ? (
        fixtures.loading || !fixtures.data ? (
          <Spinner label="Loading fixtures & predicted XIs…" />
        ) : (
          <MatchesView
            fixtures={fixtures.data}
            elements={bootstrap.data.elements}
            teamsMap={teamsMap}
            gw={nextGw ?? currentGw ?? 1}
            squadTeamIds={squadTeamIds}
          />
        )
      ) : null}

      {/* SECTION 4: CHIPS TAB (Full simulation) */}
      {tab === "chips" ? (
        optimizer.loading && !optimizer.data ? (
          <Spinner label="Running MILP chip simulations across remaining gameweeks…" />
        ) : optimizer.error || !optimizer.data ? (
          <ErrorBox
            message={optimizer.error ?? "Could not run chip simulator."}
            onRetry={optimizer.refresh}
          />
        ) : (
          <ChipsView
            optimizer={optimizer.data}
            elementsMap={elementsMap}
            teamsMap={teamsMap}
          />
        )
      ) : null}

      {/* RIVALS TAB */}
      {tab === "rivals" && currentGw ? (
        <RivalsView
          entry={entry.data}
          myPicks={squadIds}
          elementsMap={elementsMap}
          currentGw={currentGw}
        />
      ) : null}

      {/* SECTION 2: VERDICT TAB */}
      {tab === "verdict" ? (
        <TabErrorBoundary
          tabName="Verdict"
          onRetry={() => {
            optimizer.refresh();
            curPicks.refresh();
          }}
        >
          {optimizer.loading && !optimizer.data ? (
            <VerdictSkeleton />
          ) : optimizer.error && !optimizer.data ? (
            <ErrorBox
              message={optimizer.error}
              onRetry={() => {
                optimizer.refresh();
                curPicks.refresh();
              }}
            />
          ) : !optimizer.data ? (
            <Card className="my-4 border-amber-400/40 bg-amber-400/10 text-center">
              <p className="text-sm font-bold text-amber-200">
                Verdict data is empty
              </p>
              <p className="mt-1 text-xs text-amber-100/90">
                Missing optimizer output for Team #{teamId} (GW{nextGw ?? "—"}).
              </p>
              <button
                type="button"
                onClick={() => {
                  optimizer.refresh();
                  curPicks.refresh();
                }}
                className="mt-3 rounded-full bg-gradient-to-r from-[#cda228] to-[#84d21c] px-4 py-1.5 text-xs font-extrabold text-[#000000]"
              >
                Retry Verdict
              </button>
            </Card>
          ) : (
            <VerdictView
              entry={entry.data}
              picks={effectiveCurPicks}
              elements={bootstrap.data.elements}
              elementsMap={elementsMap}
              teamsMap={teamsMap}
              events={bootstrap.data.events}
              optimizer={optimizer.data}
              nextGw={nextGw}
              onRetry={() => {
                optimizer.refresh();
                curPicks.refresh();
              }}
            />
          )}
        </TabErrorBoundary>
      ) : null}

      {/* SECTION 5: AUTO OPTIMIZED TAB */}
      {tab === "auto" ? (
        <TabErrorBoundary tabName="Auto Optimized" onRetry={optimizer.refresh}>
          {optimizer.loading && !optimizer.data ? (
            <Spinner label="Solving optimal squad & lineup…" />
          ) : optimizer.error || !optimizer.data ? (
            <ErrorBox
              message={optimizer.error ?? "Could not load Auto Optimized plan."}
              onRetry={optimizer.refresh}
            />
          ) : (
            <AutoOptimizedView
              optimizer={optimizer.data}
              elementsMap={elementsMap}
              teamsMap={teamsMap}
              horizon={horizon}
              onChangeHorizon={setHorizon}
              onOpenVerdict={() => setTab("verdict")}
              onOpenPlanner={() => setTab("planner")}
            />
          )}
        </TabErrorBoundary>
      ) : null}

      {/* SECTION 6: CANONICAL PLANNER */}
      {tab === "planner" ? (
        <TabErrorBoundary tabName="Planner" onRetry={optimizer.refresh}>
          <TeamPlanner initialTeamId={teamId} embedded />
        </TabErrorBoundary>
      ) : null}

      {tab === "season" ? (
        <HistoryView
          history={entry.data.history}
          events={bootstrap.data.events}
        />
      ) : null}

      {tab === "transfers" ? (
        <TransfersView
          teamId={teamId}
          elementsMap={elementsMap}
          teamsMap={teamsMap}
        />
      ) : null}

      {tab === "copilot" ? (
        <TabErrorBoundary tabName="Copilot" onRetry={optimizer.refresh}>
          <CopilotChat teamId={teamId} onNavigate={(t) => setTab(TABS.some(([key]) => key === t) ? t as Tab : "analysis")} />
        </TabErrorBoundary>
      ) : null}

      {tab === "status" ? (
        <DataModelStatus optimizer={optimizer.data} />
      ) : null}
    </main>
  );
}
