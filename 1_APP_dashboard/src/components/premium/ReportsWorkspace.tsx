"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useJson } from "@/lib/useJson";
import { getSavedTeamId, saveTeamId } from "@/lib/helpers";
import type { GameweekReport } from "@/lib/reportPayload";
import { ReportAutomationSettings } from "./ReportAutomationSettings";

export function ReportsWorkspace() {
  const [manager, setManager] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [gw, setGw] = useState(7);
  useEffect(() => { // eslint-disable-next-line react-hooks/set-state-in-effect -- local browser settings hydration
    setManager(getSavedTeamId());
  }, []);
  const report = useJson<GameweekReport>(manager ? `/api/reports/${manager}/${gw}` : null);
  function submit(ev: FormEvent) { ev.preventDefault(); if (!/^\d{1,10}$/.test(input) || Number(input) < 1) return; setManager(input); saveTeamId(input); setInput(""); }
  return <main className="premium-workspace py-6"><div className="premium-head"><div><p className="premium-overline">VORTEX STUDIO / REPORTING</p><h1>Slides & Matchday Reports</h1><p>Print-ready HTML report, data JSON and original 4K visual. PPTX/PDF batch exports use the included offline report renderer.</p></div></div>
    <div className="premium-controlbar mt-4"><form onSubmit={submit} className="flex items-end gap-2"><label>FPL manager ID<input value={input} onChange={(ev)=>setInput(ev.target.value)} placeholder={manager ?? "Enter manager"}/></label><button>Load</button></form><label>Gameweek<select value={gw} onChange={(ev)=>setGw(Number(ev.target.value))}>{Array.from({length:38},(_,i)=>i+1).map((week)=><option key={week} value={week}>GW{week}</option>)}</select></label></div>
    {report.loading ? <p className="premium-feedback">Loading official report data…</p> : null}
    {report.error ? <p className="premium-feedback">{report.error}</p> : null}
    {report.data ? <><div className="premium-controlbar no-print"><a className="premium-link" href={`/api/reports/${manager}/${gw}`} download={`vortex-gw${gw}-data.json`}>Report data (JSON)</a><a className="premium-link" href={`/api/reports/${manager}/${gw}/png`}>Download 4K PNG (sign-in required)</a><button type="button" onClick={()=>window.print()}>Print / Save PDF</button></div>
      <article className="premium-report-sheet"><p className="premium-overline">FPL VORTEX / GAMEWEEK REVIEW</p><h2>GW{gw} — {report.data.teamName}</h2><div className="premium-kpi-grid"><div className="premium-stat"><span>GW points</span><strong>{report.data.actualPoints ?? "—"}</strong></div><div className="premium-stat"><span>Overall rank</span><strong>{report.data.overallRank?.toLocaleString() ?? "—"}</strong></div><div className="premium-stat"><span>Bench</span><strong>{report.data.benchPoints ?? "—"}</strong></div><div className="premium-stat"><span>Captain</span><strong>{report.data.captainName ?? "—"}</strong></div></div><div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Player</th><th>Role</th><th>Minutes</th><th>Points</th><th>Effective</th></tr></thead><tbody>{report.data.rows.map((row,index)=><tr key={index}><td>{row.player}</td><td>{row.role}</td><td>{row.minutes ?? "—"}</td><td>{row.actualPoints ?? "—"}</td><td>{row.effectivePoints ?? "—"}</td></tr>)}</tbody></table></div><p className="premium-footer-note">{report.data.note}</p></article>
    </> : !manager ? <p className="premium-feedback">Connect a manager ID to generate the report.</p> : null}
    <ReportAutomationSettings />
  </main>;
}
