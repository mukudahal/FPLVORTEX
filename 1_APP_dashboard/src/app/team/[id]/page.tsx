import { TeamDashboard } from "@/components/team/TeamDashboard";

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{tab?: string; gw?: string}>;
}) {
  const [{id}, query] = await Promise.all([params, searchParams]);
  const gw = Number(query.gw);
  return <TeamDashboard teamId={id} initialTab={query.tab} initialGw={Number.isInteger(gw) && gw >= 1 && gw <= 38 ? gw : undefined} />;
}
