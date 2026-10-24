"use client";

import { useJson } from "@/lib/useJson";

interface AutomationResponse {
  configured: boolean;
  lastRefresh: {
    ok: boolean;
    refreshedAt: string;
    players: number;
    fixtures: number;
    nextGameweek: number | null;
  } | null;
}

export function AutomationHealth() {
  const { data, error } = useJson<AutomationResponse>("/api/automation/status", 5 * 60 * 1000);
  const refresh = data?.lastRefresh;
  const canDisplayDate = refresh && Number.isFinite(new Date(refresh.refreshedAt).getTime());
  return (
    <div className="vx-auto-status" aria-live="polite">
      <div><span className="intel-indicator" /><strong>DATA PIPELINE</strong><span>FPL fixtures + players · 5-minute on-demand cache</span></div>
      <div>
        {error ? "Background sync status unavailable" : !data ? "Checking background sync…" :
          !data.configured ? "Scheduled sync needs CRON_SECRET" :
          refresh?.ok && canDisplayDate ? `Last scheduled refresh ${new Date(refresh.refreshedAt).toLocaleString()} · ${refresh.players} players` :
          "Scheduled sync configured · first run pending"}
      </div>
    </div>
  );
}
