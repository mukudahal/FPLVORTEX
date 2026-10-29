import { ChevronDown } from 'lucide-react';
import type { Snapshot } from '../lib/types';
import { getSnapshotFreshness, snapshotFreshnessNotice } from '../lib/snapshotFreshness';
import { filenameProjectionDate, importedProjectionsNotice, projectionFreshness, snapshotSourceLabel } from '../lib/projectionFreshness';
import { auditNormalizedPlayers, playerDataQualityNotice } from '../lib/playerDataQuality';

export function DataStatus({ snapshot }: { snapshot: Snapshot }) {
  const age = getSnapshotFreshness(snapshot.meta);
  const imported = snapshot.meta.repoData;
  const date = imported?.projectionFileDate ?? filenameProjectionDate(imported?.benchmarkFile ?? '');
  const projection = projectionFreshness(date);
  return <details className="data-status">
    <summary>
      <span className="data-status__source">{snapshotSourceLabel(snapshot.meta)} · {age.ageMinutes === null ? 'age unknown' : `${age.ageMinutes} min old`}</span>
      <span className="data-status__warning">{projection.status === 'stale' ? `Imported projections may be stale · ${date}` : projection.status === 'unknown' ? 'Projection freshness unknown' : `Imported projections · ${date}`}</span>
      <span className="data-status__toggle">Data details <ChevronDown size={14} /></span>
    </summary>
    <div className="data-status__body" role="status" aria-label="FPL data and imported projection status">
      <p>{snapshotFreshnessNotice(snapshot.meta)}</p>
      <p>{importedProjectionsNotice(imported)}</p>
      <p>{playerDataQualityNotice(snapshot.meta.playerDataQuality ?? auditNormalizedPlayers(snapshot.players, snapshot.teams, snapshot.meta.generatedAt))}</p>
    </div>
  </details>;
}
