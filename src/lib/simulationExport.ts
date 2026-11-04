import type { PlannerSimulationInput, PlannerSimulationOutput } from './repoModel/compassPlanner';
import { MC_CAL } from './repoModel/monteCarlo';

/** Export contract version; sampler assumptions remain uncalibrated. */
export const SIMULATION_EXPORT_VERSION = 'vortex-paired-fixture-v1';

export async function createSimulationExport(input: PlannerSimulationInput, result: PlannerSimulationOutput,
  provenance: { completedAt: string; snapshotAt: string; snapshotSource?: string; snapshotStale?: boolean }) {
  if (![provenance.completedAt, provenance.snapshotAt].every(value => Number.isFinite(Date.parse(value))))
    throw new Error('Simulation timestamps unavailable. Run again.');
  if (result.monteCarlo.draws !== (input.draws ?? 3000) || result.monteCarlo.gws[0] !== input.nextGw ||
      result.sourcePlan?.id !== input.manualPlan?.id ||
      (input.forecastAsOf !== undefined && input.forecastAsOf !== provenance.snapshotAt))
    throw new Error('Simulation inputs changed. Run again before exporting.');
  const inputJson = JSON.stringify(input);
  const inputVersion = 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inputJson))),
    byte => byte.toString(16).padStart(2, '0')).join('');
  return {
    schemaVersion: 1, modelVersion: SIMULATION_EXPORT_VERSION, inputVersion,
    ...provenance, calibration: 'unverified' as const, samplerParameters: MC_CAL,
    seed: result.monteCarlo.seed, draws: result.monteCarlo.draws, gameweeks: result.monteCarlo.gws,
    selectedPlan: input.manualPlan ? { id: input.manualPlan.id, name: input.manualPlan.name } : null,
    input: JSON.parse(inputJson) as PlannerSimulationInput, result,
  };
}

export type SimulationExport = Awaited<ReturnType<typeof createSimulationExport>>;

function cell(value: unknown): string {
  let text = value == null ? '' : String(value);
  // Plan names are user input: keep spreadsheet downloads inert.
  if (/^[\s]*[=+@-]/.test(text) && typeof value !== 'number') text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function simulationCsv(data: SimulationExport): string {
  const header = ['model_version','input_version','completed_at','snapshot_at','snapshot_source','snapshot_stale','calibration','seed','draws','gameweeks','plan_id',
    'path_id','path_label','mean_points','p10_points','median_points','p90_points','sd_points','gain_vs_hold',
    'prob_beats_hold','prob_ties_hold','reference_id','gain_vs_reference','prob_beats_reference'];
  const rows = data.result.monteCarlo.paths.map(path => [data.modelVersion,data.inputVersion,data.completedAt,data.snapshotAt,data.snapshotSource ?? 'unknown',data.snapshotStale ?? 'unknown',
    data.calibration,data.seed,data.draws,data.gameweeks.join(';'),data.selectedPlan?.id,path.id,path.label,path.mean,
    path.p10,path.median,path.p90,path.sd,path.deltaMean,path.probBeatsHold,path.probDrawsHold,
    path.vsReference?.referenceId,path.vsReference?.deltaMean,path.vsReference?.probWin]);
  return [header,...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function downloadSimulation(content: string, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
