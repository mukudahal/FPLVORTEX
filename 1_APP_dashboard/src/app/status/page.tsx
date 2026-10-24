import Link from "next/link";
import { DataModelStatus } from "@/components/DataModelStatus";
import { ModelHealthView } from "@/components/premium/ModelHealthView";

export const metadata = {
  title: "Data & Model Status · FPL Vortex",
};

export default function StatusPage() {
  return (
    <main className="px-3 pt-5">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-white">
            Data &amp; Model Status
          </h1>
          <p className="text-xs text-slate-400">
            FPL Vortex live cache freshness, xPts backtest accuracy &amp; MILP solver run time
          </p>
        </div>
        <Link
          href="/"
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
        >
          ← Home
        </Link>
      </div>
      <DataModelStatus />
      <ModelHealthView />
    </main>
  );
}
