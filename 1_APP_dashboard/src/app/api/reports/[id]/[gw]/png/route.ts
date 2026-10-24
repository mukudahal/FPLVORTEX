import sharp from "sharp";
import { currentUser, enforceAuthRateLimit } from "@/server/auth";
import { loadGameweekReport } from "@/server/gameweekReport";
import { reportCoverSvg } from "@/lib/reportPayload";

export const dynamic = "force-dynamic";
export const maxDuration = 45;
export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: Promise<{id: string;gw:string}> }) {
  const {id,gw} = await params;
  if (!/^\d{1,10}$/.test(id) || !/^\d{1,2}$/.test(gw) || Number(gw) < 1 || Number(gw) > 38) return Response.json({error:"Invalid manager or gameweek."},{status:400});
  try {
    const user = await currentUser(req);
    if (!user) return Response.json({error:"Sign in to generate high-resolution reports."},{status:401});
    if (!await enforceAuthRateLimit(req, user.email, "4k-report", 3))
      return Response.json({error:"High-resolution generation quota exceeded."},{status:429});
    const report = await loadGameweekReport(Number(id), Number(gw));
    const png = await sharp(Buffer.from(reportCoverSvg(report))).png({ compressionLevel: 9 }).toBuffer();
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "no-store", "content-disposition": `attachment; filename="vortex-gw${Number(gw)}-4k.png"` } });
  } catch { return Response.json({error:"Could not render 4K report."},{status:502}); }
}
