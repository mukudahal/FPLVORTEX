import { forwardRef, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Clock, X } from 'lucide-react';
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
  maskWhenBlurred?: boolean;
}

function renderHighlightedId(idText: string, rawQuery: string) {
  const q = rawQuery.trim();
  if (!q) return idText;
  const idx = idText.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return idText;
  const before = idText.slice(0, idx);
  const match = idText.slice(idx, idx + q.length);
  const after = idText.slice(idx + q.length);
  return (
    <>
      {before}
      <mark className="vx-team-id-mark">{match}</mark>
      {after}
    </>
  );
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
    maskWhenBlurred = false,
  },
  forwardedRef,
) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const matchingTeams = useMemo(() => filterRecentTeams(recentTeams, value), [recentTeams, value]);
  const otherSavedTeams = useMemo(
    () => recentTeams.filter((item) => !matchingTeams.some((m) => m.id === item.id)),
    [matchingTeams, recentTeams],
  );
  const combinedOptions = useMemo(
    () => [...matchingTeams, ...otherSavedTeams],
    [matchingTeams, otherSavedTeams],
  );
  const showDropdown = open && combinedOptions.length > 0;

  useEffect(() => {
    setActiveIndex(matchingTeams.length > 0 && value.trim().length > 0 ? 0 : -1);
  }, [value, matchingTeams.length, recentTeams.length]);

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

  const renderOption = (item: RecentTeamEntry, idx: number) => (
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
        <strong className="vx-team-id-option__id">{renderHighlightedId(item.id, value)}</strong>
        {(item.teamName || item.managerName) && (
          <span className="vx-team-id-option__meta">{item.teamName ?? item.managerName}</span>
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
          }}
          onClick={() => onRemoveRecent(item.id)}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );

  return (
    <div ref={wrapperRef} className={classNames('vx-team-id-autocomplete', className)}>
      <input
        ref={forwardedRef}
        id={id}
        type={maskWhenBlurred && !focused && value.trim().length > 0 ? 'password' : 'text'}
        inputMode="numeric"
        autoComplete="off"
        placeholder=""
        value={value}
        aria-label={ariaLabel}
        aria-expanded={showDropdown}
        aria-controls={showDropdown ? listboxId : undefined}
        aria-autocomplete="list"
        onFocus={(e) => {
          setFocused(true);
          if (value.trim().length > 0) {
            e.currentTarget.select();
          }
          if (recentTeams.length > 0) setOpen(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
        onClick={() => {
          if (recentTeams.length > 0) setOpen(true);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            if (!open && recentTeams.length > 0) {
              e.preventDefault();
              setOpen(true);
              setActiveIndex(0);
              return;
            }
            if (!showDropdown) return;
            e.preventDefault();
            setActiveIndex((prev) => (prev + 1) % combinedOptions.length);
          } else if (e.key === 'ArrowUp' && showDropdown) {
            e.preventDefault();
            setActiveIndex((prev) => (prev <= 0 ? combinedOptions.length - 1 : prev - 1));
          } else if (e.key === 'Enter' && showDropdown && activeIndex >= 0 && combinedOptions[activeIndex]) {
            if (combinedOptions[activeIndex].id !== value.trim()) {
              e.preventDefault();
              pickRecent(combinedOptions[activeIndex].id);
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />

      {value.trim().length > 0 && (
        <button
          type="button"
          className={classNames('vx-team-id-clear', recentTeams.length > 0 && 'has-chevron')}
          tabIndex={0}
          aria-label="Clear typed FPL Team ID"
          title="Clear and pick another saved ID"
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => { onChange(''); if (recentTeams.length > 0) setOpen(true); }}
        >
          <X size={12} />
        </button>
      )}

      {recentTeams.length > 0 && (
        <button
          type="button"
          className="vx-team-id-chevron"
          tabIndex={0}
          aria-label="Show saved FPL Team IDs"
          title={`Saved FPL Team IDs (${recentTeams.length})`}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => setOpen(prev => !prev)}
        >
          <span>{recentTeams.length}</span>
          <ChevronDown size={13} />
        </button>
      )}

      {showDropdown && (
        <div id={listboxId} role="listbox" className="vx-team-id-dropdown" aria-label="Saved FPL Team IDs">
          {matchingTeams.length > 0 && (
            <>
              <div className="vx-team-id-dropdown__label">
                <Clock size={11} />
                <span>{value.trim() ? 'Matching saved IDs' : `Saved FPL IDs (${recentTeams.length})`}</span>
              </div>
              {matchingTeams.map((item, idx) => renderOption(item, idx))}
            </>
          )}

          {otherSavedTeams.length > 0 && (
            <>
              <div className="vx-team-id-dropdown__label vx-team-id-dropdown__label--sub">
                <Clock size={11} />
                <span>{matchingTeams.length > 0 ? 'Other saved IDs' : `Saved FPL IDs (${otherSavedTeams.length})`}</span>
              </div>
              {otherSavedTeams.map((item, idx) => renderOption(item, matchingTeams.length + idx))}
            </>
          )}
        </div>
      )}
    </div>
  );
});

