"use client";

import Link from "next/link";

/** Original FPL Vortex monogram. No third-party club branding is embedded. */
function VortexMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 52 52" className={className} aria-hidden="true" fill="none">
      <defs>
        <linearGradient id="vortex-mark-grad" x1="8" y1="0" x2="47" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#CDF99D" /><stop offset="1" stopColor="#84D21C" />
        </linearGradient>
      </defs>
      <path d="M26 3 46 10v17c0 12.6-7.4 19.1-20 22C13.4 46.1 6 39.6 6 27V10L26 3Z" fill="#112319" stroke="url(#vortex-mark-grad)" strokeWidth="2" />
      <path d="m13 14 9.6 23h6.8L39 14h-7.3l-5.7 15-5.7-15H13Z" fill="url(#vortex-mark-grad)" />
      <path d="m25 17 3.8 6h-5l-1.8-3 3-3Z" fill="#D1AD44" />
    </svg>
  );
}

export function Logo({
  size = "header",
  className = "",
}: {
  size?: "header" | "hero";
  className?: string;
}) {
  const contents = (
    <span className={`inline-flex items-center gap-2.5 ${size === "hero" ? "text-4xl" : "text-lg"}`}>
      <VortexMark className={size === "hero" ? "h-16 w-16" : "h-10 w-10"} />
      <span className="inline-flex flex-col leading-none">
        <span className="font-black tracking-[-.05em]" style={{ color: "var(--vx-text)" }}>
          FPL<span style={{ color: "var(--vx-green-text)" }}>VORTEX</span>
        </span>
        <span className="mt-1.5 text-[8px] font-extrabold tracking-[.19em] uppercase" style={{ color: "var(--vx-muted)" }}>
          DECISION INTELLIGENCE
        </span>
      </span>
    </span>
  );
  if (size === "hero") return <span className={className}>{contents}</span>;
  return <Link href="/" aria-label="FPL Vortex Home" className={`inline-flex shrink-0 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#84d21c] ${className}`}>{contents}</Link>;
}

export function SocialFooter() {
  return (
    <footer className="mt-8 border-t border-[#cda228]/25 pt-4 pb-4 text-center">
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-bold">
        {/* Official YouTube logo + @FPLVORTEX */}
        <a
          href="https://www.youtube.com/@FPLVORTEX"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3.5 py-1.5 text-slate-100 transition hover:border-[#FF0000]/60 hover:bg-white/[0.1]"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0">
            <path
              fill="#FF0000"
              d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"
            />
            <path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          <span>@FPLVORTEX</span>
        </a>

        {/* Official X logo + FPLVORTEXM */}
        <a
          href="https://x.com/FPLVORTEXM"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3.5 py-1.5 text-slate-100 transition hover:border-[#cda228]/60 hover:bg-white/[0.1]"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="currentColor"
            className="h-3.5 w-3.5 shrink-0"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span>FPLVORTEXM</span>
        </a>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        FPL Vortex · Live Fantasy Premier League Analytics &amp; MILP Optimizer
      </p>
    </footer>
  );
}
