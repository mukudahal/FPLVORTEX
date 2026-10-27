export function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatPrice(value: number): string {
  return `£${value.toFixed(1)}m`;
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-GB', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatSigned(value: number, digits = 1): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

export function formatDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return 'TBC';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'TBC';
  return new Intl.DateTimeFormat('en-GB', options ?? {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function relativeTime(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'just now';
  const seconds = Math.round((time - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
  if (abs < 60) return formatter.format(Math.round(seconds), 'second');
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return formatter.format(Math.round(seconds / 3600), 'hour');
  return formatter.format(Math.round(seconds / 86400), 'day');
}

export function countdown(target: string | null | undefined): {
  label: string;
  parts: Array<{ value: string; unit: string }>;
  expired: boolean;
} {
  if (!target) return { label: 'Deadline TBC', parts: [], expired: false };
  const diff = new Date(target).getTime() - Date.now();
  if (!Number.isFinite(diff)) return { label: 'Deadline TBC', parts: [], expired: false };
  if (diff <= 0) return { label: 'Deadline passed', parts: [], expired: true };
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    label: `${days}d ${hours}h ${minutes}m ${seconds}s`,
    parts: [
      { value: String(days).padStart(2, '0'), unit: 'days' },
      { value: String(hours).padStart(2, '0'), unit: 'hrs' },
      { value: String(minutes).padStart(2, '0'), unit: 'min' },
      { value: String(seconds).padStart(2, '0'), unit: 'sec' },
    ],
    expired: false,
  };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function positionName(position: string): string {
  return (
    {
      GKP: 'Goalkeeper',
      DEF: 'Defender',
      MID: 'Midfielder',
      FWD: 'Forward',
    }[position] ?? position
  );
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
