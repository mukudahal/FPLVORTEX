import { resolvePlayerImage } from "@/lib/playerImageResolver";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: codeStr } = await params;
  const code = Number(codeStr);

  if (!Number.isInteger(code) || code <= 0) {
    return new NextResponse("Invalid player code", { status: 400 });
  }

  try {
    const result = await resolvePlayerImage(code);
    const body = new Uint8Array(result.buffer);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
        "X-Player-Image-Source": result.source,
        ...(result.fotmobId ? { "X-FotMob-ID": String(result.fotmobId) } : {}),
      },
    });
  } catch (err) {
    console.error(`[FPL Vortex /api/img/player/${code} error]`, err);
    return new NextResponse("Failed to resolve image", { status: 500 });
  }
}
