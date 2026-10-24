"use client";
import { useJson } from "@/lib/useJson";
interface Health { season:string;modelVersion:string;predictions:{ source:string;calibrated:boolean;backtest:string;priceProbability:string;minutesSource:string };optimizer:{verification:string;chipRules:string};note:string }
export function ModelHealthView() {
  const health = useJson<Health>("/api/model/health", 300_000);
  return <section className="premium-surface mt-4"><div className="premium-section-header"><h2>Forecast and rules verification</h2><p>Provenance and known release limitations.</p></div><div className="premium-section-body">
    {health.error ? <p className="premium-feedback">{health.error}</p> : null}
    {health.data ? <><div className="premium-kpi-grid"><div className="premium-stat"><span>Season</span><strong>{health.data.season}</strong></div><div className="premium-stat"><span>Model version</span><strong className="!text-base">{health.data.modelVersion}</strong></div><div className="premium-stat"><span>Historical calibration</span><strong>{health.data.predictions.calibrated ? "Verified" : "Pending"}</strong></div><div className="premium-stat"><span>Price-change probabilities</span><strong>Unverified</strong></div></div><p className="premium-feedback">{health.data.note}</p></> : <p className="premium-feedback">Loading model status…</p>}
  </div></section>;
}
