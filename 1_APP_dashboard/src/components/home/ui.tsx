"use client";

import type { ReactNode } from "react";

export function Panel({
  title,
  icon,
  right,
  children,
  className = "",
}: {
  title: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`vx-card flex min-h-0 flex-col overflow-hidden ${className}`}>
      <div className="vx-card-head flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h2 className="vx-text flex items-center gap-2 text-sm font-extrabold">
          {icon}
          {title}
        </h2>
        {right}
      </div>
      <div className="vx-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  filled = false,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  filled?: boolean;
}) {
  return (
    <div className={filled ? "vx-tabs vx-tabs-filled" : "vx-tabs"}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="vx-tab"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />;
}

export function Message({ children }: { children: ReactNode }) {
  return <p className="vx-muted px-4 py-8 text-center text-sm">{children}</p>;
}

/** "1–10 of 667 players  ·  Page 1 of 67  ‹ ›" footer used by every long list. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  label = "players",
  filled = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  label?: string;
  filled?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const btn = filled
    ? "vx-btn vx-btn-sm !px-0 h-8 w-8"
    : "vx-iconbtn h-7 w-7 rounded-lg disabled:opacity-40";
  return (
    <div
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
      style={{ borderTop: "1px solid var(--vx-border)" }}
    >
      <span className="vx-muted">
        {from}–{to} of {total.toLocaleString()} {label}
      </span>
      <span className="flex items-center gap-1.5">
        <button type="button" aria-label="First page" disabled={page === 0} onClick={() => onPage(0)} className={btn}>
          «
        </button>
        <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)} className={btn}>
          ‹
        </button>
        <span className="vx-muted px-1">
          Page {page + 1} of {pages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
          className={btn}
        >
          ›
        </button>
        <button
          type="button"
          aria-label="Last page"
          disabled={page >= pages - 1}
          onClick={() => onPage(pages - 1)}
          className={btn}
        >
          »
        </button>
      </span>
    </div>
  );
}
