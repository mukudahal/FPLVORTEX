export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'brand brand--compact' : 'brand'}>
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" role="presentation">
          <defs>
            <linearGradient id="brand-gradient" x1="4" y1="4" x2="44" y2="44">
              <stop stopColor="var(--brand-mint)" />
              <stop offset=".5" stopColor="var(--brand-violet)" />
              <stop offset="1" stopColor="var(--brand-pink)" />
            </linearGradient>
          </defs>
          <circle cx="24" cy="24" r="21" className="brand__orbit" />
          <path
            d="M37 12.7c-5.1-5.3-13.8-4.8-19.3.7-5.6 5.5-5.8 14-.9 18.8 4.9 4.9 13.1 4.4 18.2-.7 4.1-4.1 5-9.8 2.4-14"
            fill="none"
            stroke="url(#brand-gradient)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M30 19.7c-2.3-2.4-6.2-2.1-8.7.3-2.5 2.5-2.6 6.3-.4 8.5 2.2 2.2 5.9 2 8.2-.6 1.9-1.9 2.3-4.5 1.1-6.4"
            fill="none"
            stroke="url(#brand-gradient)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="25" cy="24" r="2.7" fill="var(--text-primary)" />
        </svg>
      </span>
      <span className="brand__text">
        <strong>FPL VORTEX</strong>
        {!compact && <small>INTELLIGENCE ENGINE</small>}
      </span>
    </div>
  );
}
