import { IntelligenceWorkspace } from "@/components/premium/IntelligenceWorkspace";

export default async function ReviewPage({ params }: { params: Promise<{ id: string; gw: string }> }) {
  const { id, gw } = await params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(gw) || Number(gw) < 1 || Number(gw) > 38) return <p className="premium-feedback">Invalid manager or gameweek.</p>;
  return <IntelligenceWorkspace mode="review" initialTeamId={id} initialGw={Number(gw)} />;
}
