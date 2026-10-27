import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import type { Snapshot } from '../lib/types';
import { classNames, relativeTime } from '../lib/format';

interface SourcePillProps {
  snapshot: Snapshot | null;
  refreshing: boolean;
  lastSuccessAt: string | null;
  onRefresh: () => void;
  compact?: boolean;
}

export function SourcePill({ snapshot, refreshing, lastSuccessAt, onRefresh, compact = false }: SourcePillProps) {
  const source = snapshot?.meta.source ?? 'offline';
  const healthy = snapshot?.meta.upstreamOk && !snapshot.meta.stale;
  const label = source === 'live' || source === 'cache' ? 'LIVE SYNC' : source === 'snapshot' ? 'SNAPSHOT' : 'OFFLINE';
  return (
    <div className={classNames('source-pill', compact && 'source-pill--compact')} title={snapshot?.meta.generatedAt}>
      <span className={classNames('source-pill__dot', healthy ? 'is-live' : 'is-stale')} />
      <span className="source-pill__label">{label}</span>
      {!compact && (
        <span className="source-pill__time">
          {lastSuccessAt ? relativeTime(lastSuccessAt) : 'connecting'}
        </span>
      )}
      <button
        className="icon-button icon-button--tiny"
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh live data"
        title="Refresh live data"
      >
        {refreshing ? <RefreshCw size={13} className="spin" /> : healthy ? <Wifi size={13} /> : <WifiOff size={13} />}
      </button>
    </div>
  );
}
