import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

/** Optional context: explanations do not occupy the default decision surface. */
export function InfoDisclosure({ label, children }: { label: string; children: ReactNode }) {
  return <details className="vx-info-disclosure" onKeyDown={event => {
    if (event.key === 'Escape') {
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    }
  }}>
    <summary aria-label={label} title={label}><Info size={17} aria-hidden="true" /></summary>
    <div className="vx-info-content">{children}</div>
  </details>;
}
