"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getSavedTeamId } from "@/lib/helpers";

/** Full-width sticky header: logo left, links centre/left, theme switch top-right. */
export function TopBar() {
  const pathname = usePathname();
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only state after mount
    setTeamId(getSavedTeamId());
  }, [pathname]);

  const primary = [
    { href: "/", label: "Dashboard" },
    { href: "/review", label: "GW Review" },
    { href: "/planner", label: "Team Planner" },
    { href: "/leagues", label: "Mini-League" },
    { href: "/predictions", label: "Predictions" },
    { href: "/threats", label: "Threats" },
    { href: "/captaincy", label: "Captaincy" },
  ];
  const secondary = [
    { href: teamId ? `/team/${teamId}` : "/", label: "My Team" },
    { href: "/market", label: "Price Watch" },
    { href: "/injuries", label: "Injuries" },
    { href: "/fixtures", label: "Fixtures" },
    { href: "/players", label: "Players" },
    { href: "/reports", label: "Reports" },
    { href: "/status", label: "Status" },
    { href: "/account", label: "Account" },
  ];
  const active = (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className="sticky top-0 z-30 border-b border-[#cda228]/35 backdrop-blur-md"
      style={{ background: "var(--vx-header)" }}
    >
      <div className="mx-auto flex w-full max-w-[1760px] items-center gap-3 px-3 py-1.5 sm:px-5 lg:px-8">
        <Logo size="header" />
        <nav className="ml-2 hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:flex" aria-label="Main sections">
          {primary.map(({href, label}) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition ${active(href) ? "border border-[#cda228]/50 bg-[#cda228]/15 vx-gold" : "vx-muted border border-transparent hover:bg-[#cda228]/10"}`}>{label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <nav className="flex items-center gap-1 lg:hidden" aria-label="Quick links">
            <Link href="/review" className="vx-muted rounded-md p-2 text-xs">Review</Link>
            <Link href="/planner" className="vx-muted rounded-md p-2 text-xs">Planner</Link>
          </nav>
          <ThemeToggle />
        </div>
      </div>
      <nav className="hidden items-center justify-center gap-1 overflow-x-auto border-t border-white/5 px-3 py-1.5 lg:flex" aria-label="Analysis tools">
        {secondary.map(({ href, label }) => <Link key={label} href={href} aria-current={active(href) ? "page" : undefined}
          className={`whitespace-nowrap rounded-lg px-3 py-1 text-xs font-semibold ${active(href) ? "vx-gold bg-[#cda228]/10" : "vx-muted hover:bg-white/5"}`}>{label}</Link>)}
      </nav>
    </header>
  );
}

/**
 * The dashboard home uses the whole screen; the older single-column pages
 * (team, plan, players…) get a wider, centred column instead of the old phone width.
 */
export function PageFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wide = ["/", "/planner", "/review", "/leagues", "/predictions", "/market", "/injuries", "/threats", "/captaincy", "/reports"].some((route) => pathname === route || (route !== "/" && pathname.startsWith(`${route}/`)));
  return (
    <div
      className={`vx-page-frame mx-auto min-h-dvh w-full pb-28 md:pb-10 ${
        wide ? "max-w-[1760px] px-3 sm:px-5 lg:px-8" : "max-w-5xl"
      }`}
    >
      {children}
    </div>
  );
}
