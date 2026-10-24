import { NextResponse } from "next/server";
import { FplError } from "@/lib/fpl";
import { loadTransfers } from "@/server/fplData";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId) || entryId < 1) {
    return NextResponse.json({ error: "Invalid team ID." }, { status: 400 });
  }
  try {
    const transfers = await loadTransfers(entryId);
    return NextResponse.json(transfers);
  } catch (err) {
    const status = err instanceof FplError && err.status === 404 ? 404 : 502;
    return NextResponse.json(
      { error: "Could not load transfer history." },
      { status },
    );
  }
}
