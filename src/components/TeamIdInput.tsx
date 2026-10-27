import { forwardRef, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Clock, X } from 'lucide-react';
import { classNames } from '../lib/format';
import { filterRecentTeams, type RecentTeamEntry } from '../lib/recentTeamIds';

interface TeamIdInputProps {
  id?: string;
  value: string;
  onChange: (nextValue: string) => void;
  onSelectRecent?: (selectedId: string) => void;
  onRemoveRecent?: (idToRemove: string) => void;
  recentTeams?: RecentTeamEntry[];
  ariaLabel?: string;
  className?: string;
}

export const TeamIdInput = forwardRef<HTMLInputElement, TeamIdInputProps>(function TeamIdInput(
  {
    id,
    value,
    onChange,
    onSelectRecent,
    onRemoveRecent,
    recentTeams = [],
    ariaLabel,
    className,
  },
  forwardedRef,
) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const matches = useMemo(() => filterRecentTeams(recentTeams, value), [recentTeams, value]);
  const showDropdown = open && matches.length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [value, recentTeams.length]);

  useEffect(() => {
    if (!showDropdown) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [showDropdown]);

  const pickRecent = (selectedId: string) => {
    onChange(selectedId);
    setOpen(false);
    setActiveIndex(-1);
    onSelectRecent?.(selectedId);
  };

  return (
    <div ref={wrapperRef} className={classNames('vx-team-id-autocomplete', className)}>
      <input
        ref={forwardedRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder=""
        value={value}
        aria-label={ariaLabel}
        aria-expanded={showDropdown}
        aria-controls={showDropdown ? listboxId : undefined}
        aria-autocomplete="list"
        onFocus={() => {
          if (recentTeams.length > 0) setOpen(true);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!showDropdown) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((prev) => (prev + 1) % matches.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((prev) => (prev <= 0 ? matches.length - 1 : prev - 1));
          } else if (e.key === 'Enter' && activeIndex >= 0 && matches[activeIndex]) {
            e.preventDefault();
            pickRecent(matches[activeIndex].id);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />

      {showDropdown && (
        <div id={listboxId} role="listbox" className="vx-team-id-dropdown" aria-label="Previously entered FPL Team IDs">
          <div className="vx-team-id-dropdown__label">
            <Clock size={11} />
            <span>Previously entered</span>
          </div>
          {matches.map((item, idx) => (
            <div
              key={item.id}
              role="option"
              aria-selected={idx === activeIndex}
              className={classNames('vx-team-id-option', idx === activeIndex && 'is-active')}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                pickRecent(item.id);
              }}
            >
              <div className="vx-team-id-option__main">
                <strong className="vx-team-id-option__id">{item.id}</strong>
                {(item.teamName || item.managerName) && (
                  <span className="vx-team-id-option__meta">
                    {item.teamName ?? item.managerName}
                  </span>
                )}
              </div>
              {onRemoveRecent && (
                <button
                  type="button"
                  className="vx-team-id-option__remove"
                  aria-label={`Remove saved ID ${item.id}`}
                  title="Remove from saved IDs"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveRecent(item.id);
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
