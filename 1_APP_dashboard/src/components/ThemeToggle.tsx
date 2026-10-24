"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";
const KEY = "vortex-theme";

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // storage blocked – the choice just won't persist
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#ffffff" : "#000000");
}

const SunIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path
      d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      strokeLinecap="round"
    />
  </svg>
);

const MoonIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Small sun / moon switch for the top-right corner. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only state after mount
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    apply(next);
  }

  const base =
    "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors";
  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="vx-chip inline-flex items-center gap-0.5 rounded-full p-0.5"
    >
      <button
        type="button"
        aria-label="Light mode"
        aria-pressed={theme === "light"}
        title="Light mode"
        onClick={() => choose("light")}
        className={`${base} ${
          theme === "light" ? "bg-[#cda228] text-black shadow" : "vx-muted hover:text-[#cda228]"
        }`}
      >
        {SunIcon}
      </button>
      <button
        type="button"
        aria-label="Dark mode"
        aria-pressed={theme === "dark"}
        title="Dark mode"
        onClick={() => choose("dark")}
        className={`${base} ${
          theme === "dark" ? "bg-[#84d21c] text-black shadow" : "vx-muted hover:text-[#8a6a0c]"
        }`}
      >
        {MoonIcon}
      </button>
    </div>
  );
}
