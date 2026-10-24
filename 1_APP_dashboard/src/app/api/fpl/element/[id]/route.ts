import { NextResponse } from "next/server";
import { FplError } from "@/lib/fpl";
import { loadElementSummary } from "@/server/fplData";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const elementId = Number(id);
  if (!Number.isInteger(elementId) || elementId < 1) {
    return NextResponse.json({ error: "Invalid player ID." }, { status: 400 });
  }
  try {
    const summary = await loadElementSummary(elementId);
    return NextResponse.json(summary);
  } catch (err) {
    const status = err instanceof FplError && err.status === 404 ? 404 : 502;
    return NextResponse.json(
      { error: "Could not load player details." },
      { status },
    );
  }
}
