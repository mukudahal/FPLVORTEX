import { chipLabel, formatPrice, POSITIONS } from "@/lib/helpers";
import type {
  EntrySummary,
  OptimizerResponse,
  SlimElement,
  SlimTeam,
} from "@/lib/types";

export type CopilotIntent =
  | "win"
  | "transfer"
  | "captain"
  | "chip"
  | "bench"
  | "differential"
  | "general";

export interface CopilotContext {
  teamId: string;
  entry: EntrySummary;
  optimizer: OptimizerResponse;
  elementsMap: Map<number, SlimElement>;
  teamsMap: Map<number, SlimTeam>;
}

export interface CopilotAnswer {
  intent: CopilotIntent;
  headline: string;
  confidence: number;
  sections: { title: string; lines: string[] }[];
  checklist: string[];
  navigateTo?: string[];
}

export function detectIntent(question: string): CopilotIntent {
  const q = question.toLowerCase();
  if (/(win|best.*(move|recommend|advice|plan)|what.*(do|should i do)|how.*(win|climb|catch))/.test(q))
    return "win";
  if (/(transfer|sell|buy|swap|bring in|take out|hit|-4)/.test(q)) return "transfer";
  if (/(captain|vice|armband|triple)/.test(q)) return "captain";
  if (/(chip|wildcard|free hit|bench boost|triple captain)/.test(q)) return "chip";
  if (/(bench|starter|lineup|xi|formation|order)/.test(q)) return "bench";
  if (/(differential|punt|template|ownership|cover|chasing|leading|rival)/.test(q))
    return "differential";
  return "general";
}

function playerLabel(
  id: number,
  elementsMap: Map<number, SlimElement>,
  teamsMap: Map<number, SlimTeam>,
): string {
  const el = elementsMap.get(id);
  if (!el) return `#${id}`;
  const team = teamsMap.get(el.team)?.short_name ?? "";
  return `${el.web_name} (${POSITIONS[el.element_type] ?? ""}${team ? ` · ${team}` : ""} · ${formatPrice(el.now_cost)})`;
}

function confidenceFor(opt: OptimizerResponse): number {
  const c = opt.optimizedNextGw?.confidence;
  if (typeof c === "number" && c >= 25 && c <= 99) return Math.round(c);
  return 72;
}

/** The single "best recommendation to win" summary every answer is built on. */
export function buildWinCore(ctx: CopilotContext) {
  const { optimizer, elementsMap, teamsMap, entry } = ctx;
  const gw = optimizer.nextGw;
  const winner = optimizer.winner;
  const decision = optimizer.recommendedDecision;
  const chip = optimizer.recommendedChipDecision;
  const bestMove = winner?.transfers?.[0] ?? null;

  const transferLine =
    decision === "TRANSFER" && bestMove
      ? `Sell ${playerLabel(bestMove.outId, elementsMap, teamsMap)}, buy ${playerLabel(bestMove.inId, elementsMap, teamsMap)}, +${bestMove.xPtsGainNextGw.toFixed(1)} xPts next GW (Estimate), +${bestMove.xPtsGainHorizon.toFixed(1)} xPts over ${optimizer.horizon} GWs (Estimate), hit ${winner.hitCost}`
      : `No change needed — best move gains +${(optimizer.options.find((o) => o.id === "transfer1")?.netGainVsRoll ?? 0).toFixed(2)} xPts (Estimate), below the +${optimizer.rollThresholdXPts.toFixed(2)} xPts roll threshold, so bank the transfer (FTs ${optimizer.freeTransfersNow} → ${optimizer.freeTransfersAfterRoll})`;

  const captainId = optimizer.optimizedNextGw?.captainId;
  const captain = captainId ? elementsMap.get(captainId) : undefined;
  const captainLine = captain
    ? `Captain ${captain.web_name} (+${optimizer.optimizedNextGw.captainXPts.toFixed(1)} xPts extra, Estimate), vice ${elementsMap.get(optimizer.optimizedNextGw.viceId)?.web_name ?? "—"}`
    : "Captain pick not solved — Not enough data";

  const chipLine =
    chip.action === "PLAY" && chip.chip
      ? `PLAY ${chipLabel(chip.chip)} now in GW${gw} (+${chip.gainNow.toFixed(1)} xPts, Estimate)`
      : `HOLD chips — best future is ${chipLabel(chip.bestFutureChip) ?? "—"} in GW${chip.bestFutureGw ?? "—"} (+${chip.bestFutureGain.toFixed(1)} xPts, Estimate) vs +${chip.gainNow.toFixed(1)} now`;

  const benchLine = optimizer.optimizedNextGw?.bench?.length
    ? `Bench order ${optimizer.optimizedNextGw.bench
        .map((id, i) => `${i + 1}. ${elementsMap.get(id)?.web_name ?? id}`)
        .join(" → ")}`
    : "Bench order not solved — Not enough data";

  const teamName = entry.name || `Team ${ctx.teamId}`;
  return { gw, decision, winner, chip, bestMove, transferLine, captainLine, chipLine, benchLine, teamName };
}

export function buildCopilotAnswer(
  question: string,
  ctx: CopilotContext,
): CopilotAnswer {
  const intent = detectIntent(question);
  const core = buildWinCore(ctx);
  const { optimizer, elementsMap } = ctx;
  const confidence = confidenceFor(optimizer);
  const gw = core.gw;

  const decisionSection = {
    title: `Transfer — ${core.decision} (GW${gw})`,
    lines: [
      core.transferLine,
      `Why in numbers: winner nets +${core.winner.netGainVsRoll.toFixed(2)} xPts (Estimate) after −${core.winner.hitCost} hit vs banking (+${optimizer.bankedTransferValueNextGw.toFixed(2)} xPts value next GW, Estimate).`,
      `Options: ${optimizer.options.map((o) => `${o.label}: ${o.netGainVsRoll >= 0 ? "+" : ""}${o.netGainVsRoll.toFixed(2)} net`).join(" · ")}`,
    ],
  };
  const captainSection = {
    title: `Captain (GW${gw})`,
    lines: [
      core.captainLine,
      `Safe vs differential: vice-captain covers the template; differential captain only if chasing and you need variance.`,
    ],
  };
  const chipSection = {
    title: `Chip — ${core.chip.action}${core.chip.chip ? ` ${chipLabel(core.chip.chip)}` : ""}`,
    lines: [
      core.chipLine,
      core.chip.why,
    ],
  };
  const benchSection = { title: "Bench order", lines: [core.benchLine] };

  const map: Record<CopilotIntent, CopilotAnswer> = {
    win: {
      intent,
      headline: `${core.decision === "TRANSFER" ? "TRANSFER" : "ROLL"} · ${core.chip.action === "PLAY" ? `PLAY ${chipLabel(core.chip.chip)}` : "HOLD chips"} · Captain ${elementsMap.get(optimizer.optimizedNextGw.captainId)?.web_name ?? "—"} (GW${gw})`,
      confidence,
      sections: [decisionSection, captainSection, chipSection, benchSection],
      checklist: [
        core.transferLine,
        core.captainLine,
        core.chipLine,
        core.benchLine,
      ],
      navigateTo: ["verdict", "planner"],
    },
    transfer: {
      intent,
      headline: core.decision === "TRANSFER" ? "Make the transfer" : "Roll the transfer",
      confidence,
      sections: [decisionSection, benchSection],
      checklist: [core.transferLine, core.benchLine],
      navigateTo: ["verdict"],
    },
    captain: {
      intent,
      headline: core.captainLine,
      confidence,
      sections: [captainSection, decisionSection],
      checklist: [core.captainLine],
      navigateTo: ["verdict"],
    },
    chip: {
      intent,
      headline: core.chipLine,
      confidence,
      sections: [chipSection, decisionSection],
      checklist: [core.chipLine],
      navigateTo: ["verdict"],
    },
    bench: {
      intent,
      headline: core.benchLine,
      confidence,
      sections: [benchSection, captainSection],
      checklist: [core.benchLine, core.captainLine],
      navigateTo: ["auto"],
    },
    differential: {
      intent,
      headline: core.decision === "TRANSFER" ? "Attack with the transfer" : "Hold template, bank for variance later",
      confidence: Math.max(55, confidence - 5),
      sections: [decisionSection, captainSection],
      checklist: [core.transferLine, core.captainLine],
      navigateTo: ["rivals", "verdict"],
    },
    general: {
      intent,
      headline: `${core.decision} · ${core.chip.action === "PLAY" ? `PLAY ${chipLabel(core.chip.chip)}` : "HOLD chips"} (GW${gw})`,
      confidence,
      sections: [decisionSection, captainSection, chipSection],
      checklist: [core.transferLine, core.captainLine, core.chipLine],
      navigateTo: ["verdict"],
    },
  };
  return map[intent];
}
