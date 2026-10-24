import { NextResponse } from "next/server";
import { FplError } from "@/lib/fpl";
import { computeOptimizerForEntry } from "@/server/optimizerTask";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isSafeInteger(entryId) || entryId <= 0) {
    return NextResponse.json({ error: "Invalid team ID." }, { status: 400 });
  }
  const requestedHorizon = Number(new URL(request.url).searchParams.get("horizon") ?? 5);
  const horizon = Math.max(1, Math.min(10, Number.isInteger(requestedHorizon) ? requestedHorizon : 5));
  try {
    return NextResponse.json(await computeOptimizerForEntry(entryId, horizon));
  } catch (error) {
    console.error(`[FPL Vortex optimizer ${entryId} failure]`, error);
    const status = error instanceof FplError ? error.status : 500;
    return NextResponse.json({ error: "Could not run optimizer for this team." }, { status });
  }
}
