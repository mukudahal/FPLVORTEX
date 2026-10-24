import { pool } from "@/db";
import { dueReportLocalSlot, type ReportSchedule } from "@/lib/reportScheduling";

/** No queued or published reports without explicit stored opt-in. */
export async function enqueueDueUserReports(now: Date): Promise<number> {
  const rows = await pool.query<{
    user_id: string; entry_id: number; timezone: "America/New_York";
    am_hour:number;am_minute:number;pm_hour:number;pm_minute:number;enabled:boolean;
  }>(`SELECT user_id,entry_id,timezone,am_hour,am_minute,pm_hour,pm_minute,enabled
    FROM report_schedules WHERE enabled=true ORDER BY user_id,entry_id LIMIT 500`);
  let queued = 0;
  for (const row of rows.rows) {
    const schedule: ReportSchedule = { userId:row.user_id,entryId:row.entry_id,timezone:row.timezone,
      amHour:row.am_hour,amMinute:row.am_minute,pmHour:row.pm_hour,pmMinute:row.pm_minute,enabled:row.enabled };
    const slot = dueReportLocalSlot(schedule, now);
    if (!slot) continue;
    const key = `report:${schedule.userId}:${schedule.entryId}:${slot}`;
    const created = await pool.query<{id:string}>(`INSERT INTO background_jobs(job_key,user_id,kind,payload)
      VALUES($1,$2,'report',$3::jsonb) ON CONFLICT(job_key) DO NOTHING RETURNING id`,
    [key, schedule.userId, JSON.stringify({ entryId: schedule.entryId, slot })]);
    queued += created.rowCount ?? 0;
  }
  return queued;
}
