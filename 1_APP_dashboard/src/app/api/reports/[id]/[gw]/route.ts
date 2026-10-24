import { loadGameweekReport } from "@/server/gameweekReport";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(_req: Request, {params}: {params: Promise<{id:string;gw:string}>}) {
  const {id,gw} = await params;
  if (!/^\d{1,10}$/.test(id) || !/^\d{1,2}$/.test(gw) || Number(gw) < 1 || Number(gw) > 38) return Response.json({error: "Invalid manager or gameweek."}, {status:400});
  try { const data = await loadGameweekReport(Number(id), Number(gw)); return Response.json(data, { headers: { "cache-control": "no-store" } }); }
  catch { return Response.json({error:"Could not assemble official report data."}, {status: 502}); }
}
