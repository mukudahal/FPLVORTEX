import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { classNames } from '../lib/format';

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: 'mint' | 'violet' | 'pink' | 'amber' | 'blue';
  delta?: number;
  deltaLabel?: string;
  detail?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, icon, tone = 'violet', delta, deltaLabel, detail, footer, className }: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  const subcopy = deltaLabel ?? detail ?? footer;
  return (
    <article className={classNames('stat-card', `stat-card--${tone}`, className)}>
      <div className="stat-card__top">
        <span className="stat-card__icon">{icon}</span>
        {delta !== undefined && (
          <span className={classNames('stat-card__delta', positive ? 'is-positive' : 'is-negative')}>
            {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(delta).toFixed(1)}
          </span>
        )}
      </div>
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
      {subcopy && <div className="stat-card__footer">{subcopy}</div>}
    </article>
  );
}
