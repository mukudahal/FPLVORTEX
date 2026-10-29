import { NextResponse } from "next/server";
import { FplError } from "@/lib/fpl";
import { loadBootstrapDetailed } from "@/server/fplData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await loadBootstrapDetailed();

    return NextResponse.json(result.data, {
      headers: {
        "cache-control": "no-store",
        "x-fpl-data-status": result.status,
        "x-fpl-fetched-at": result.fetchedAt,
      },
    });
  } catch (err) {
    const status =
      err instanceof FplError && err.status === 404 ? 404 : 502;

    return NextResponse.json(
      {
        error: "Could not load FPL game data. Try again shortly.",
      },
      { status }
    );
  }
}