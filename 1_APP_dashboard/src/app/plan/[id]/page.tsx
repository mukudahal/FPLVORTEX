import { redirect } from "next/navigation";

export const metadata = { title: "Team Planner | FPL VORTEX" };

/** Old deep links remain valid; browser drafts are imported by the canonical planner. */
export default async function PlanPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  if (!/^\d+$/.test(id) || Number(id) < 1) redirect("/planner");
  redirect(`/planner/${id}`);
}
