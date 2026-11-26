/**
 * Dashboard-only point labels. Event points are meaningful for the exact
 * locked/current GW; public bootstrap event_points is not historical history.
 * Never imply a previous GW score or a future forecast has been verified.
 */
export interface DashboardPitchPointsInput {
  selectedGw: number;
  entryGw: number | null;
  currentGw: number;
  nextGw: number;
  eventPoints: number | null | undefined;
  projectedPoints: number | null | undefined;
  multiplier: number;
}

export interface DashboardPitchPoints {
  text: string;
  label: 'PTS' | 'xPts' | 'N/A';
  source: 'recorded' | 'projected' | 'unavailable';
}

export function dashboardPitchPoints(input: DashboardPitchPointsInput): DashboardPitchPoints {
  const { selectedGw, entryGw, currentGw, nextGw, eventPoints, projectedPoints, multiplier } = input;
  const unavailable: DashboardPitchPoints = { text: '—', label: 'N/A', source: 'unavailable' };
  if (!Number.isInteger(selectedGw) || selectedGw < 1 || !Number.isFinite(multiplier) || multiplier <= 0) {
    return unavailable;
  }
  if (entryGw !== null && entryGw === selectedGw && currentGw === selectedGw) {
    if (eventPoints == null || !Number.isFinite(eventPoints)) return unavailable;
    return { text: String(eventPoints * multiplier), label: 'PTS', source: 'recorded' };
  }
  if (nextGw > 0 && selectedGw >= nextGw) {
    if (projectedPoints == null || !Number.isFinite(projectedPoints)) return unavailable;
    return { text: (projectedPoints * multiplier).toFixed(1), label: 'xPts', source: 'projected' };
  }
  return unavailable;
}

/** Bench cards retain their individual points. Multipliers follow the settled official picks. */
export function dashboardPitchMultiplier(recorded: boolean, officialMultiplier: number | undefined, forecastCaptain: boolean): number {
  if (recorded) return officialMultiplier === 2 || officialMultiplier === 3 ? officialMultiplier : 1;
  return forecastCaptain ? 2 : 1;
}
