"use client";

import { useState } from "react";
import { playerPhotoUrl } from "@/lib/helpers";

export function PlayerPhoto({
  code,
  alt,
  className = "",
}: {
  code: number;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <svg
        viewBox="0 0 110 140"
        className={`aspect-[11/14] ${className}`}
        aria-label={alt}
      >
        <rect width="110" height="140" fill="transparent" />
        <circle cx="55" cy="48" r="26" fill="#475569" />
        <path d="M13 140c0-30 19-48 42-48s42 18 42 48Z" fill="#475569" />
      </svg>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={playerPhotoUrl(code)}
      alt={alt}
      width={110}
      height={140}
      loading="lazy"
      className={`aspect-[11/14] object-cover object-top ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
