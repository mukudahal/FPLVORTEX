"use client";
import { useEffect, useState, type FormEvent } from "react";
import { getSavedTeamId } from "@/lib/helpers";
import { useJson } from "@/lib/useJson";
interface Schedule { entryId:number; timezone:string;amHour:number;amMinute:number;pmHour:number;pmMinute:number;enabled:boolean }
export function ReportAutomationSettings() {
  const schedules = useJson<{schedules:Schedule[]}>("/api/report-schedule");
  const [entryId,setEntryId] = useState("");
  const [am,setAm] = useState("05:30");
  const [pm,setPm] = useState("17:20");
  const [enabled,setEnabled] = useState(false);
  const [message,setMessage] = useState("");
  useEffect(()=>{ // eslint-disable-next-line react-hooks/set-state-in-effect -- browser manager state
    setEntryId(getSavedTeamId() ?? "");
  }, []);
  useEffect(()=>{
    const row=schedules.data?.schedules.find((schedule)=>String(schedule.entryId)===entryId);
    if(!row) return;
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate persisted settings after fetch */
    setEnabled(row.enabled);
    setAm(`${String(row.amHour).padStart(2,"0")}:${String(row.amMinute).padStart(2,"0")}`);
    setPm(`${String(row.pmHour).padStart(2,"0")}:${String(row.pmMinute).padStart(2,"0")}`);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [schedules.data,entryId]);
  async function submit(event:FormEvent) {
    event.preventDefault();setMessage("Saving…");
    if (!/^\d+$/.test(entryId) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(am) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(pm)) {setMessage("Please enter a valid manager and 24-hour times.");return;}
    const [amHour,amMinute]=am.split(":").map(Number),[pmHour,pmMinute]=pm.split(":").map(Number);
    try {const response=await fetch("/api/report-schedule",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({entryId:Number(entryId),amHour,amMinute,pmHour,pmMinute,enabled})});
      if(!response.ok) {setMessage(response.status===401?"Sign in to save automated report settings.":`Save failed (${response.status}).`);return;}
      setMessage(enabled?"Schedule saved. Reports will be archived at the chosen local times when the scheduler and worker are deployed.":"Automated reports disabled.");schedules.refresh();}
    catch {setMessage("Unable to reach the report scheduling service.");}
  }
  return <section className="premium-surface no-print mt-4"><div className="premium-section-header"><h2>Automated report archive</h2><p>Disabled by default. Two daily New York local times, automatically accounting for EDT/EST. This does not send emails or posts.</p></div>
    <div className="premium-section-body"><form className="premium-controlbar" onSubmit={submit}><label>My manager ID<input value={entryId} onChange={(ev)=>setEntryId(ev.target.value)} inputMode="numeric" required /></label>
      <label>Morning (ET)<input type="time" value={am} onChange={(ev)=>setAm(ev.target.value)} required/></label><label>Evening (ET)<input type="time" value={pm} onChange={(ev)=>setPm(ev.target.value)} required/></label>
      <label className="!flex-row items-center gap-2"><input type="checkbox" checked={enabled} onChange={(ev)=>setEnabled(ev.target.checked)} /> Enable</label><button type="submit">Save schedule</button></form>
    <p className="premium-feedback" role="status">{message || (schedules.error ? "Sign in to read or change your report schedule." : "Scheduled reports are archived privately. Cloud delivery requires a separate integration.")}</p></div>
  </section>;
}
