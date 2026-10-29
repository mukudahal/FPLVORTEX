import { useEffect, useMemo, useState } from 'react';
import {
  buildJerseyFallbackSvgDataUri,
  getPlayerPhotoCandidates,
} from '../lib/playerImages';
import { classNames } from '../lib/format';

export interface PlayerAvatarProps {
  code: number | null | undefined;
  teamCode?: number | null | undefined;
  name: string;
  fullName?: string;
  teamShort?: string;
  position?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function PlayerAvatar({
  code,
  teamCode,
  name,
  fullName,
  teamShort = 'FPL',
  position,
  size = 'md',
  className,
}: PlayerAvatarProps) {
  const candidates = useMemo(
    () => getPlayerPhotoCandidates(code, teamCode, size),
    [code, teamCode, size],
  );
  const fallbackUri = useMemo(
    () => buildJerseyFallbackSvgDataUri(fullName || name, teamShort, position === 'GKP'),
    [fullName, name, position, teamShort],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [code, teamCode, size]);

  const activeSrc = candidateIndex < candidates.length ? candidates[candidateIndex] : fallbackUri;
  const altText = `${fullName || name} (${teamShort}) player portrait`;

  return (
    <span className={classNames('player-avatar', `player-avatar--${size}`, className)}>
      <img
        src={activeSrc}
        alt={altText}
        loading="lazy"
        decoding="async"
        data-player-code={code ?? ''}
        data-team-code={teamCode ?? ''}
        onError={() => {
          setCandidateIndex((prev) => (prev < candidates.length ? prev + 1 : prev));
        }}
      />
    </span>
  );
}
