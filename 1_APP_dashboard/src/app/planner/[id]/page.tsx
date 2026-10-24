import { TeamPlanner } from "@/components/planner/TeamPlanner";

export const metadata = {title: "Team Planner | FPL VORTEX"};

export default async function PlannerEntryPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  if (!/^\d+$/.test(id) || Number(id) < 1) {
    return <main className="vx-dash p-6" role="alert">Invalid FPL team ID.</main>;
  }
  return <TeamPlanner initialTeamId={id} />;
}
