import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, ExternalLink, Play, X } from 'lucide-react';
import { YouTubeBrandLogo } from './SocialIcons';
import type { VideoItem } from '../lib/types';

export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@Fplvortex';

/**
 * Ensures every `@FPLVORTEX` channel link (`https://www.youtube.com/@Fplvortex`) opens the channel directly
 * in standalone browsers via native `<a target="_blank">`, and falls back to the in-app `@FPLVORTEX` player
 * modal when clicked inside a popup-restricted preview iframe so the link is never dead/unclickable.
 */
export function handleYouTubeChannelClick(
  e: ReactMouseEvent<HTMLAnchorElement>,
  fallbackOpenModal?: () => void,
): void {
  e.stopPropagation();
  if (typeof window === 'undefined') return;
  try {
    if (window.self === window.top) {
      return;
    }
  } catch {
    // Cross-origin frame access throws SecurityError -> definitely inside an iframe.
  }
  e.preventDefault();
  let opened: Window | null = null;
  try {
    opened = window.open(YOUTUBE_CHANNEL_URL, '_blank', 'noopener,noreferrer');
  } catch {
    opened = null;
  }
  if (!opened && fallbackOpenModal) {
    fallbackOpenModal();
  }
}

const FALLBACK_CHANNEL_VIDEOS: VideoItem[] = [
  {
    id: 'TCP2HYD9djk',
    title: 'FPL GW8 Free Hit Team: Best Picks, Fixtures & Captain | FPL VORTEX',
    published: '2026-10-22T19:50:44Z',
    thumbnail: 'https://i.ytimg.com/vi/TCP2HYD9djk/mqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=TCP2HYD9djk',
  },
  {
    id: 'BbpBksRewHc',
    title: 'FPL GW8 Final Decisions: Transfers, Bench & Captain | FPL VORTEX',
    published: '2026-10-22T03:17:00Z',
    thumbnail: 'https://i.ytimg.com/vi/BbpBksRewHc/mqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=BbpBksRewHc',
  },
  {
    id: '65WusHtnHZg',
    title: 'FPL GW8 Final Decisions: Transfers, Bench & Captain | FPL VORTEX',
    published: '2026-10-21T18:27:00Z',
    thumbnail: 'https://i.ytimg.com/vi/65WusHtnHZg/mqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=65WusHtnHZg',
  },
  {
    id: 'Vv4gjlb-YHk',
    title: 'FPL GW8 Tips: Fixtures, Goals & Clean Sheets | GW7 Review (1/3) #FPL',
    published: '2026-10-19T02:50:49Z',
    thumbnail: 'https://i.ytimg.com/vi/Vv4gjlb-YHk/mqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=Vv4gjlb-YHk',
  },
];

interface YouTubePlayerModalProps {
  open: boolean;
  initialVideo?: VideoItem | null;
  videos?: VideoItem[];
  onClose: () => void;
}

export function YouTubePlayerModal({
  open,
  initialVideo,
  videos = [],
  onClose,
}: YouTubePlayerModalProps) {
  const playlist = videos.length > 0 ? videos : FALLBACK_CHANNEL_VIDEOS;
  const [selectedId, setSelectedId] = useState<string | null>(initialVideo?.id ?? null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedId(initialVideo?.id ?? playlist[0]?.id ?? null);
  }, [open, initialVideo?.id, playlist]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const activeVideo =
    playlist.find((v) => v.id === selectedId) ?? initialVideo ?? playlist[0] ?? null;

  const embedSrc = activeVideo
    ? `https://www.youtube.com/embed/${encodeURIComponent(activeVideo.id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
    : '';

  const handleCopyChannel = async () => {
    try {
      await navigator.clipboard.writeText(YOUTUBE_CHANNEL_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be restricted in some frames.
    }
  };

  const modalNode = (
    <div
      className="vx-yt-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="@FPLVORTEX YouTube Video Player"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="vx-yt-modal-card">
        <div className="vx-yt-modal-header">
          <div className="vx-yt-modal-brand">
            <YouTubeBrandLogo size={24} />
            <div>
              <strong>@FPLVORTEX · Official YouTube</strong>
              <small>youtube.com/@Fplvortex</small>
            </div>
          </div>

          <div className="vx-yt-modal-actions">
            <button
              type="button"
              className="vx-yt-modal-action-btn"
              onClick={handleCopyChannel}
              title="Copy @FPLVORTEX YouTube link"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'Copied!' : 'Copy Link'}</span>
            </button>
            <a
              href={YOUTUBE_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="vx-yt-modal-action-btn is-channel"
              onClick={() => {
                try {
                  window.open(YOUTUBE_CHANNEL_URL, '_blank', 'noopener,noreferrer');
                } catch {
                  // Anchor default handles standalone browsers.
                }
              }}
            >
              <span>@FPLVORTEX Channel</span>
              <ExternalLink size={13} />
            </a>
            <button
              type="button"
              className="vx-yt-modal-close"
              onClick={onClose}
              aria-label="Close YouTube player"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {activeVideo && (
          <div className="vx-yt-player-frame-wrap">
            <iframe
              key={activeVideo.id}
              src={embedSrc}
              title={activeVideo.title}
              className="vx-yt-player-iframe"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        )}

        {activeVideo && (
          <div className="vx-yt-now-playing">
            <div className="vx-yt-now-playing__info">
              <span className="vx-yt-live-badge">NOW PLAYING</span>
              <h4>{activeVideo.title}</h4>
            </div>
            <a
              href={activeVideo.url || `https://www.youtube.com/watch?v=${activeVideo.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="vx-yt-watch-ext"
            >
              <span>Watch on YouTube</span>
              <ExternalLink size={12} />
            </a>
          </div>
        )}

        <div className="vx-yt-playlist" aria-label="More videos from @FPLVORTEX">
          <div className="vx-yt-playlist__head">
            <span>More from @FPLVORTEX ({playlist.slice(0, 8).length} latest videos)</span>
          </div>
          <div className="vx-yt-playlist__strip">
            {playlist.slice(0, 8).map((video) => {
              const isCurrent = activeVideo?.id === video.id;
              return (
                <button
                  type="button"
                  key={video.id}
                  className={`vx-yt-playlist__item ${isCurrent ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(video.id)}
                >
                  <div className="vx-yt-playlist__thumb">
                    <img
                      src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                      alt=""
                      loading="lazy"
                    />
                    <span className="vx-yt-playlist__play">
                      <Play size={11} fill="currentColor" />
                    </span>
                  </div>
                  <div className="vx-yt-playlist__meta">
                    <span className="vx-yt-playlist__title">{video.title}</span>
                    <small>
                      {new Date(video.published).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </small>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
}
