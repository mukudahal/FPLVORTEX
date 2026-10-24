export interface ReportSchedule {
  userId: string; entryId: number; timezone: "America/New_York";
  amHour: number; amMinute: number; pmHour: number; pmMinute: number;
  enabled: boolean;
}

/** Temporal math must use IANA time zones, not hard-coded EST/EDT offsets. */
export function dueReportLocalSlot(schedule: ReportSchedule, instant: Date): string | null {
  if (!schedule.enabled || !Number.isFinite(instant.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: schedule.timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const data = Object.fromEntries(formatter.formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const hour = Number(data.hour);
  const minute = Number(data.minute);
  const due = (hour === schedule.amHour && minute === schedule.amMinute) || (hour === schedule.pmHour && minute === schedule.pmMinute);
  return due ? `${data.year}-${data.month}-${data.day}T${data.hour}:${data.minute}` : null;
}
