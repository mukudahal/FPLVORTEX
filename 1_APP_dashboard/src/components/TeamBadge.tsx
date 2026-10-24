"use client";

import { useState } from "react";
import { teamBadgeUrl } from "@/lib/helpers";

export function TeamBadge({
  code,
  shortName = "",
  className = "h-4 w-4",
}: {
  code?: number | null;
  shortName?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!code || failed) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-white/15 text-[8px] font-bold text-slate-200 ${className}`}
        title={shortName}
      >
        {shortName ? shortName.slice(0, 3) : "FC"}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={teamBadgeUrl(code)}
      alt={shortName}
      loading="lazy"
      className={`object-contain ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
