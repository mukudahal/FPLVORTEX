import { FORECAST_MODEL_VERSION } from "@/server/forecastIdentity";
import { RULES_2026_27 } from "@/lib/seasonRules";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({
    season: RULES_2026_27.season, modelVersion: FORECAST_MODEL_VERSION,
    predictions: { source: "official_fpl_optaderived_plus_heuristics", calibrated: false,
      backtest: "requires published frozen pre-deadline forecast runs and observed outcomes",
      priceProbability: "not_available", minutesSource: "fpl_appearance_heuristic" },
    optimizer: { verification: "awaiting_live_postgres_worker_and_production_build", chipRules: "2026_27_verified" },
    data: { source: "official_public_fpl_endpoints", freshness: "see /api/status and source headers" },
    note: "Source implementation exists, but model accuracy and live integrations must be independently measured.",
  }, { headers: { "cache-control": "no-store" } });
}
