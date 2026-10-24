import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { pricePredictions, priceSnapshots } from "@/db/schema";
import { loadBootstrap } from "@/server/fplData";
import type { SlimElement } from "@/lib/types";

export const dynamic = "force-dynamic";

const SNAPSHOT_INTERVAL_MIN = 30;
const PREDICT_THRESHOLD = 0.7; // record a prediction when P(change) >= 70%
const WINDOW_HOURS = 30;

export interface PriceRow {
  id: number;
  webName: string;
  nowCost: number;
  netTransfersEvent: number;
  selectedByPercent: string;
  changePercent: number | null;
  hourlyRate: number | null;
  probability: number; // 0..1 probability of a change in the window
  direction: "rise" | "fall" | "hold";
  timingWindow: string;
  momentum: number | null; // our snapshot-based signal (net transfers/hr per 1% owned)
  lockedUntil: string | null;
  costChangeEvent: number;
}

export interface PriceResponse {
  rows: PriceRow[];
  accuracy: { correct: number; wrong: number; pending: number; pct: number | null };
  recentPredictions: {
    webName: string;
    direction: string;
    probability: number;
    outcome: string;
    predictedAt: string;
  }[];
  snapshotAgeMin: number | null;
}

function probabilityFrom(changePercent: number | null, momentum: number | null): {
  prob: number;
  dir: "rise" | "fall" | "hold";
} {
  // Primary: FPL's own progress metric (−100..100). Secondary: our momentum.
  let signal = 0;
  if (changePercent !== null) {
    signal = changePercent / 100; // −1..1
  } else if (momentum !== null) {
    signal = Math.max(-1, Math.min(1, momentum / 50));
  }
  const prob = Math.min(0.99, Math.abs(signal));
  if (prob < 0.05) return { prob, dir: "hold" };
  return { prob, dir: signal > 0 ? "rise" : "fall" };
}

function timingWindow(prob: number, hourlyRate: number | null): string {
  if (prob >= 0.95) return "tonight (~1-3h)";
  if (prob >= 0.85) return "likely tonight";
  if (prob >= 0.7) return "next 24h";
  if (prob >= 0.4) {
    if (hourlyRate && Math.abs(hourlyRate) >= 30) return "1-2 days";
    return "2-3 days";
  }
  return "no change soon";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 60);

  try {
    const raw = await loadBootstrap();
    const byId = new Map(raw.elements.map((e) => [e.id, e]));

    // Ensure top league-wide risers & fallers are included alongside squad + watchlist
    const numOrNull = (v: unknown): number | null =>
      v != null && !Number.isNaN(Number(v)) ? Number(v) : null;

    const topRisers = [...raw.elements]
      .filter((e) => e.element_type <= 4)
      .sort(
        (a, b) =>
          (numOrNull(b.price_change_percent) ?? 0) -
            (numOrNull(a.price_change_percent) ?? 0) ||
          b.transfers_in_event -
            b.transfers_out_event -
            (a.transfers_in_event - a.transfers_out_event),
      )
      .slice(0, 8)
      .map((e) => e.id);
    const topFallers = [...raw.elements]
      .filter((e) => e.element_type <= 4)
      .sort(
        (a, b) =>
          (numOrNull(a.price_change_percent) ?? 0) -
            (numOrNull(b.price_change_percent) ?? 0) ||
          a.transfers_in_event -
            a.transfers_out_event -
            (b.transfers_in_event - b.transfers_out_event),
      )
      .slice(0, 8)
      .map((e) => e.id);

    for (const extraId of [...topRisers, ...topFallers]) {
      if (!ids.includes(extraId) && ids.length < 60) ids.push(extraId);
    }

    // ---- 1. take a snapshot for tracked ids if the last one is stale ----
    const now = new Date();
    let snapshotAgeMin: number | null = null;
    const lastSnap = await db
      .select({ takenAt: priceSnapshots.takenAt })
      .from(priceSnapshots)
      .orderBy(desc(priceSnapshots.takenAt))
      .limit(1);
    if (lastSnap[0]) {
      snapshotAgeMin = Math.round(
        (now.getTime() - lastSnap[0].takenAt.getTime()) / 60000,
      );
    }
    const needSnapshot =
      ids.length > 0 &&
      (snapshotAgeMin === null || snapshotAgeMin >= SNAPSHOT_INTERVAL_MIN);
    if (needSnapshot) {
      const values = ids
        .map((id) => byId.get(id))
        .filter((e): e is SlimElement => !!e)
        .map((e) => ({
          elementId: e.id,
          nowCost: e.now_cost,
          transfersInEvent: e.transfers_in_event,
          transfersOutEvent: e.transfers_out_event,
          selectedByPercent: parseFloat(e.selected_by_percent) || 0,
          changePercent: numOrNull(e.price_change_percent),
          takenAt: now,
        }));
      if (values.length > 0) await db.insert(priceSnapshots).values(values);
      snapshotAgeMin = 0;
    }

    // ---- 2. resolve pending predictions ----
    const pending = await db
      .select()
      .from(pricePredictions)
      .where(eq(pricePredictions.outcome, "pending"));
    for (const p of pending) {
      const el = byId.get(p.elementId);
      if (!el) continue;
      const moved = el.now_cost - p.priceAt;
      const hit =
        (p.direction === "rise" && moved > 0) ||
        (p.direction === "fall" && moved < 0);
      if (hit) {
        await db
          .update(pricePredictions)
          .set({ outcome: "correct", resolvedAt: now })
          .where(eq(pricePredictions.id, p.id));
      } else if (now > p.windowEnds) {
        await db
          .update(pricePredictions)
          .set({ outcome: "wrong", resolvedAt: now })
          .where(eq(pricePredictions.id, p.id));
      }
    }

    // ---- 3. compute momentum from snapshots (net transfer velocity / ownership) ----
    const momentumById = new Map<number, number>();
    if (ids.length > 0) {
      const since = new Date(now.getTime() - 24 * 3600 * 1000);
      const snaps = await db
        .select()
        .from(priceSnapshots)
        .where(
          and(
            inArray(priceSnapshots.elementId, ids),
            gte(priceSnapshots.takenAt, since),
          ),
        )
        .orderBy(priceSnapshots.takenAt);
      const grouped = new Map<number, typeof snaps>();
      snaps.forEach((s) => {
        const arr = grouped.get(s.elementId) ?? [];
        arr.push(s);
        grouped.set(s.elementId, arr);
      });
      for (const [elId, arr] of grouped) {
        if (arr.length < 2) continue;
        const first = arr[0];
        const last = arr[arr.length - 1];
        const hours =
          (last.takenAt.getTime() - first.takenAt.getTime()) / 3600000;
        if (hours < 0.25) continue;
        const netDelta =
          last.transfersInEvent -
          last.transfersOutEvent -
          (first.transfersInEvent - first.transfersOutEvent);
        const ownedBase = Math.max(last.selectedByPercent, 0.1);
        momentumById.set(elId, netDelta / hours / (ownedBase * 1000));
      }
    }

    // ---- 4. build rows + record new predictions ----
    const rows: PriceRow[] = [];
    for (const id of ids) {
      const e = byId.get(id);
      if (!e) continue;
      const momentum = momentumById.get(id) ?? null;
      const changePct = numOrNull(e.price_change_percent);
      const hrRate = numOrNull(e.price_change_hourly_rate);
      const { prob, dir } = probabilityFrom(changePct, momentum);
      rows.push({
        id: e.id,
        webName: e.web_name,
        nowCost: e.now_cost,
        netTransfersEvent: e.transfers_in_event - e.transfers_out_event,
        selectedByPercent: e.selected_by_percent,
        changePercent: changePct,
        hourlyRate: hrRate,
        probability: prob,
        direction: dir,
        timingWindow: timingWindow(prob, hrRate),
        momentum,
        lockedUntil: e.price_change_locked_until ?? null,
        costChangeEvent: e.cost_change_event,
      });

      // record prediction if strong signal and no open one for this player
      if (prob >= PREDICT_THRESHOLD && dir !== "hold") {
        const open = await db
          .select({ id: pricePredictions.id })
          .from(pricePredictions)
          .where(
            and(
              eq(pricePredictions.elementId, id),
              eq(pricePredictions.outcome, "pending"),
            ),
          )
          .limit(1);
        if (open.length === 0) {
          await db.insert(pricePredictions).values({
            elementId: id,
            webName: e.web_name,
            direction: dir,
            probability: prob,
            priceAt: e.now_cost,
            predictedAt: now,
            windowEnds: new Date(now.getTime() + WINDOW_HOURS * 3600 * 1000),
          });
        }
      }
    }

    // ---- 5. running accuracy ----
    const counts = await db
      .select({
        outcome: pricePredictions.outcome,
        n: sql<number>`count(*)::int`,
      })
      .from(pricePredictions)
      .groupBy(pricePredictions.outcome);
    const correct = counts.find((c) => c.outcome === "correct")?.n ?? 0;
    const wrong = counts.find((c) => c.outcome === "wrong")?.n ?? 0;
    const pendingN = counts.find((c) => c.outcome === "pending")?.n ?? 0;

    const recent = await db
      .select()
      .from(pricePredictions)
      .orderBy(desc(pricePredictions.predictedAt))
      .limit(10);

    // prune snapshots older than 7 days
    await db
      .delete(priceSnapshots)
      .where(lt(priceSnapshots.takenAt, new Date(now.getTime() - 7 * 86400000)));

    const body: PriceResponse = {
      rows,
      accuracy: {
        correct,
        wrong,
        pending: pendingN,
        pct:
          correct + wrong > 0
            ? Math.round((correct / (correct + wrong)) * 100)
            : null,
      },
      recentPredictions: recent.map((r) => ({
        webName: r.webName,
        direction: r.direction,
        probability: r.probability,
        outcome: r.outcome,
        predictedAt: r.predictedAt.toISOString(),
      })),
      snapshotAgeMin,
    };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json(
      { error: "Could not compute price watch data." },
      { status: 502 },
    );
  }
}
