import { currentUser } from "@/server/auth";
import { pool } from "@/db";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({error:"Login required."},{status:401});
  const results = await pool.query(`SELECT id,gameweek,format,status,created_at,completed_at FROM report_runs
    WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[user.id]);
  return Response.json({reports:results.rows},{headers:{"cache-control":"no-store"}});
}
