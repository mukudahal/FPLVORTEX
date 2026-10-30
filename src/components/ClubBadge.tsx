import { useEffect, useMemo, useState } from 'react';
import { CLUB_COLORS, getClubBadgeCandidates } from '../lib/playerImages';
import { classNames } from '../lib/format';

export interface ClubBadgeProps {
  teamCode: number | null | undefined;
  shortName: string;
  teamName?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ClubBadge({
  teamCode,
  shortName,
  teamName,
  size = 'sm',
  className,
}: ClubBadgeProps) {
  const candidates = useMemo(() => getClubBadgeCandidates(teamCode), [teamCode]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [teamCode]);

  const palette = CLUB_COLORS[shortName.toUpperCase()] ?? {
    primary: '#3A3F7A',
    secondary: '#5BF5D6',
    text: '#FFFFFF',
  };

  if (candidateIndex >= candidates.length) {
    return (
      <span
        className={classNames('club-badge', `club-badge--${size}`, 'club-badge--fallback', className)}
        style={{ background: palette.primary, color: palette.text, borderColor: palette.secondary }}
        title={teamName ?? shortName}
        aria-label={`${teamName ?? shortName} crest`}
      >
        {shortName.slice(0, 3).toUpperCase()}
      </span>
    );
  }

  return (
    <span className={classNames('club-badge', `club-badge--${size}`, className)}>
      <img
        src={candidates[candidateIndex]}
        data-team-code={teamCode ?? ""}
        alt={`${teamName ?? shortName} club crest`}
        loading="lazy"
        decoding="async"
        onError={() => {
          setCandidateIndex((prev) => prev + 1);
        }}
      />
    </span>
  );
}
