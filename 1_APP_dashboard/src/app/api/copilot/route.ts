import { NextResponse } from "next/server";
import { loadBootstrap, loadEntry } from "@/server/fplData";
import { buildCopilotAnswer } from "@/lib/copilot";
import { explainWithModel } from "@/lib/aiAnalyst";
import { enforceAuthRateLimit, currentUser, rejectUntrustedOrigin } from "@/server/auth";
import { readJsonLimited, PayloadTooLargeError } from "@/server/requestBody";
import type { OptimizerResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CopilotBody {
  teamId?: unknown;
  question?: unknown;
}

export async function POST(req: Request) {
  const denied = rejectUntrustedOrigin(req);
  if (denied) return denied;
  if (process.env.FPL_AI_ENABLED === "true") {
    const user = await currentUser(req);
    if (!user) return NextResponse.json({error:"Sign in to use paid AI reasoning."},{status:401});
    if (!await enforceAuthRateLimit(req, user.email, "fpl-ai-copilot", 16)) return NextResponse.json({error:"AI request limit reached. Try again later."},{status:429});
  }
  let body: CopilotBody;
  try {
    const parsed = await readJsonLimited(req, 4096);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SyntaxError("Expected an object body.");
    body = parsed as CopilotBody;
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return NextResponse.json({error:"Question too large."},{status:413});
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const teamId = String(body.teamId ?? "").trim();
  const question = String(body.question ?? "").trim().slice(0, 500);
  if (!/^\d{1,10}$/.test(teamId)) {
    return NextResponse.json({ error: "teamId must be your numeric FPL Team ID." }, { status: 400 });
  }
  if (!question) {
    return NextResponse.json({ error: "Ask something, e.g. 'Best recommendation to win?'" }, { status: 400 });
  }

  try {
    const origin = new URL(req.url).origin;
    const [optRes, bsRes, entryRes] = await Promise.all([
      fetch(`${origin}/api/optimizer/${teamId}?horizon=5`, { cache: "no-store" }),
      loadBootstrap(),
      loadEntry(Number(teamId)),
    ]);
    if (!optRes.ok) {
      const errBody = (await optRes.json().catch(() => null)) as { error?: string } | null;
      console.error(`[FPL Vortex /api/copilot optimizer fetch failed for ${teamId}]`, optRes.status, errBody);
      return NextResponse.json(
        { error: errBody?.error ?? "Could not solve this team yet. Try Verdict first, then ask again." },
        { status: 502 },
      );
    }
    const optimizer = (await optRes.json()) as OptimizerResponse;
    if (!optimizer?.winner || !optimizer?.optimizedNextGw) {
      console.error(`[FPL Vortex /api/copilot incomplete optimizer payload for ${teamId}]`);
      return NextResponse.json(
        { error: "Not enough data — the solver returned an incomplete result. Retry in a minute." },
        { status: 502 },
      );
    }

    const elementsMap = new Map(bsRes.elements.map((e) => [e.id, e]));
    const teamsMap = new Map(bsRes.teams.map((t) => [t.id, t]));
    const answer = buildCopilotAnswer(question, {
      teamId,
      entry: entryRes,
      optimizer,
      elementsMap,
      teamsMap,
    });

    const modelNarrative = await explainWithModel(question, answer);
    return NextResponse.json({
      teamId,
      question,
      analysisMode: modelNarrative ? "reasoning-model" : "solver-explainer",
      model: modelNarrative?.model ?? null,
      aiNarrative: modelNarrative?.text ?? null,
      intent: answer.intent,
      headline: answer.headline,
      confidence: answer.confidence,
      sections: answer.sections,
      checklist: answer.checklist,
      navigateTo: answer.navigateTo ?? [],
      gw: optimizer.nextGw,
      solverRunMs: optimizer.solverRunMs,
      cached: optimizer.cached,
    });
  } catch (err) {
    console.error(`[FPL Vortex /api/copilot error for team ${teamId}]`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Copilot failed. Please retry." },
      { status: 500 },
    );
  }
}
