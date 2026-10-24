import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-lg shadow-black/20 ${className}`}
    >
      {children}
    </div>
  );
}

export function StatBox({
  label,
  value,
  accent = false,
  sub,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div
        className={`text-lg font-bold ${accent ? "text-[#84d21c]" : "text-slate-100"}`}
      >
        {value}
      </div>
      {sub ? <div className="text-[11px] text-slate-400">{sub}</div> : null}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-[#84d21c]" />
      {label ? <p className="text-sm">{label}</p> : null}
    </div>
  );
}

export function ErrorBox({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="m-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-center">
      <p className="text-sm text-rose-200">{message}</p>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="mt-3 rounded-full bg-rose-500/20 px-4 py-1.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/30"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function Pill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {children}
    </span>
  );
}
