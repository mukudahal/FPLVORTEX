import { BRAND_LION_SRC } from '../lib/baseUrl';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'brand brand--compact brand--lion' : 'brand brand--lion'}>
      <span className="brand__lion-wrap" aria-hidden="true">
        <img
          src={BRAND_LION_SRC}
          alt=""
          className="brand__lion-img"
          width={56}
          height={56}
        />
      </span>
      <span className="brand__text">
        <strong>FPL VORTEX</strong>
        {!compact && <small>@FPLVORTEX · INTELLIGENCE</small>}
      </span>
    </div>
  );
}
