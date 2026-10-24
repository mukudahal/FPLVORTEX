import { currentUser, rejectUntrustedOrigin } from "@/server/auth";
import { pool } from "@/db";
import { readJsonLimited } from "@/server/requestBody";

export const dynamic = "force-dynamic";

export async function GET(request:Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({error:"Login required."},{status:401});
  const rows = await pool.query(`SELECT entry_id AS "entryId",timezone,am_hour AS "amHour",am_minute AS "amMinute",pm_hour AS "pmHour",pm_minute AS "pmMinute",enabled
    FROM report_schedules WHERE user_id=$1 ORDER BY entry_id`,[user.id]);
  return Response.json({schedules:rows.rows},{headers:{"cache-control":"no-store"}});
}

export async function POST(request:Request) {
  const denied = rejectUntrustedOrigin(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return Response.json({error:"Login required."},{status:401});
  let body:Record<string,unknown>;
  try {const value = await readJsonLimited(request, 4096); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid request");body=value as Record<string,unknown>;} catch { return Response.json({error:"Invalid request body."},{status:400}); }
  const entryId = Number(body.entryId);
  const amHour = Number(body.amHour ?? 5),amMinute = Number(body.amMinute ?? 30),pmHour = Number(body.pmHour ?? 17),pmMinute = Number(body.pmMinute ?? 20);
  if (!Number.isSafeInteger(entryId) || entryId <= 0 ||
    ![amHour,pmHour,amMinute,pmMinute].every(Number.isInteger) || amHour < 0 || amHour > 23 || pmHour < 0 || pmHour > 23 ||
    amMinute < 0 || amMinute > 59 || pmMinute < 0 || pmMinute > 59 || typeof body.enabled !== "boolean") {
    return Response.json({error:"Invalid report scheduling fields."},{status:400});
  }
  await pool.query(`INSERT INTO report_schedules(user_id,entry_id,am_hour,am_minute,pm_hour,pm_minute,enabled)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(user_id,entry_id) DO UPDATE SET am_hour=$3,am_minute=$4,pm_hour=$5,pm_minute=$6,enabled=$7,updated_at=NOW()`,
  [user.id,entryId,amHour,amMinute,pmHour,pmMinute,body.enabled]);
  return Response.json({ok:true, timezone:"America/New_York",enabled:body.enabled});
}
