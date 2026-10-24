"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSavedTeamId } from "@/lib/helpers";

const HomeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 9.5V21h5v-6h4v6h5V9.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ShirtIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <path
      d="M9 3 4 6l2 4 2-1v11h8V9l2 1 2-4-5-3a3 3 0 0 1-6 0Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const UsersIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
    <path d="M16 5.5a3 3 0 1 1 0 6" strokeLinecap="round" />
    <path d="M17.5 14.5a6 6 0 0 1 4 5.5" strokeLinecap="round" />
  </svg>
);

const CalendarIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" strokeLinecap="round" />
  </svg>
);

const PulseIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <path d="M3 12h4l3-8 4 16 3-8h4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function BottomNav() {
  const pathname = usePathname();
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    setTeamId(getSavedTeamId());
  }, [pathname]);

  const items = [
    { href: "/", label: "Home", icon: HomeIcon, active: pathname === "/" },
    { href: "/review", label: "GW Review", icon: PulseIcon, active: pathname.startsWith("/review") },
    { href: "/planner", label: "Planner", icon: ShirtIcon, active: pathname.startsWith("/planner") },
    { href: "/leagues", label: "League", icon: UsersIcon, active: pathname.startsWith("/leagues") },
    { href: "/predictions", label: "Forecast", icon: CalendarIcon, active: pathname.startsWith("/predictions") },
  ];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#cda228]/30 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      style={{ background: "var(--vx-header)" }}
    >
      <div className="mx-auto flex w-full max-w-lg items-stretch justify-around">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
              item.active
                ? "text-[#dfc373]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
