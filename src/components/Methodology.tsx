import { useEffect, useState } from 'react';
import {
  Activity,
  BrainCircuit,
  Check,
  CircleDollarSign,
  Clock,
  Code2,
  Cpu,
  Database,
  ExternalLink,
  Gauge,
  GitBranch,
  Info,
  Layers,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  Zap,
} from 'lucide-react';
import type { Snapshot, VideoItem } from '../lib/types';
import { fetchVideos } from '../lib/api';
import { formatDate, formatNumber, relativeTime } from '../lib/format';

interface MethodologyProps {
  snapshot: Snapshot;
  lastSuccessAt: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}

const DATA_SOURCES = [
  {
    icon: <Database size={18} />,
    title: 'Bootstrap-static',
    text: 'Every player, club, position, price, ownership, form, minutes and underlying statistic.',
    endpoint: '/bootstrap-static/',
  },
  {
    icon: <Layers size={18} />,
    title: 'Fixtures',
    text: 'All 380 matches, kickoff times, results and official home/away difficulty ratings.',
    endpoint: '/fixtures/',
  },
  {
    icon: <Activity size={18} />,
    title: 'Live gameweek',
    text: 'In-match fantasy points used to update the current event when scoring is live.',
    endpoint: '/event/{id}/live/',
  },
  {
    icon: <ShieldCheck size={18} />,
    title: 'Team & league',
    text: 'Public entry picks, history, chips and classic league standings for connected managers.',
    endpoint: '/entry/{id} · /leagues-classic/{id}',
  },
];

const MODEL_WEIGHTS = [
  { label: 'Official next-event forecast', value: 34, tone: 'violet' },
  { label: 'Recent form', value: 30, tone: 'mint' },
  { label: 'Season points per game', value: 27, tone: 'blue' },
  { label: 'Current-event signal', value: 9, tone: 'pink' },
];

const AUTOMATIONS = [
  {
    icon: <RefreshCw size={17} />,
    title: 'Adaptive polling',
    text: '45-second refresh during live scoring and 10-minute refresh between deadlines. Tabs pause polling when hidden.',
  },
  {
    icon: <Database size={17} />,
    title: 'Stale-while-revalidate cache',
    text: 'The API keeps a last-good response in memory and ships a committed snapshot for cold starts or upstream outages.',
  },
  {
    icon: <GitBranch size={17} />,
    title: 'Scheduled data refresh',
    text: 'A GitHub Actions workflow regenerates the offline snapshot and commits it without manual intervention.',
  },
  {
    icon: <Cpu size={17} />,
    title: 'Installable PWA',
    text: 'A service worker caches the app shell and falls back to the snapshot when the user goes offline.',
  },
];

export function Methodology({ snapshot, lastSuccessAt, refreshing, onRefresh }: MethodologyProps) {
  const [videos, setVideos] = useState<VideoItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetchVideos(controller.signal)
      .then((res) => setVideos(res.videos.slice(0, 4)))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const repoMeta = snapshot.meta.repoData;

  return (
    <div className="page page--method">
      <section className="method-hero panel">
        <div>
          <span className="panel__eyebrow">TRANSPARENT BY DESIGN</span>
          <h3>A model you can inspect. Infrastructure that fails gracefully.</h3>
          <p>
            VORTEX is not a black box or a static mockup. It ingests public FPL endpoints, normalizes them through a
            typed data layer, scores players with documented signals, and solves squad selection under official rules.
          </p>
          <div className="method-hero__chips">
            <span><Check size={14} /> Official public API</span>
            <span><Check size={14} /> No credentials stored</span>
            <span><Check size={14} /> Offline fallback</span>
            <span><Check size={14} /> Automated tests & CI</span>
          </div>
        </div>
        <div className="method-orb" aria-hidden="true">
          <span /><span /><span />
          <div><BrainCircuit size={36} /><strong>VORTEX 1.0</strong></div>
        </div>
      </section>

      <div className="method-grid">
        <section className="panel system-status-panel">
          <div className="panel__header">
            <div><span className="panel__eyebrow">SYSTEM STATUS</span><h3>Data engine health</h3></div>
            <span className={snapshot.meta.upstreamOk ? 'status-dot is-live' : 'status-dot is-stale'} />
          </div>
          <div className="system-status-grid">
            <div><span>Source</span><strong>{snapshot.meta.source.toUpperCase()}</strong></div>
            <div><span>Season</span><strong>{snapshot.meta.season}</strong></div>
            <div><span>Current event</span><strong>GW {snapshot.meta.currentEventId}</strong></div>
            <div><span>Projection event</span><strong>GW {snapshot.meta.nextEventId}</strong></div>
            <div><span>Players</span><strong>{formatNumber(snapshot.players.length, 0)}</strong></div>
            <div><span>Fixtures</span><strong>{formatNumber(snapshot.fixtures.length, 0)}</strong></div>
            <div><span>Generated</span><strong>{formatDate(snapshot.meta.generatedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong></div>
            <div><span>Last sync</span><strong>{lastSuccessAt ? relativeTime(lastSuccessAt) : 'just now'}</strong></div>
            <div><span>Refresh rate</span><strong>{snapshot.meta.refreshSeconds}s</strong></div>
            <div><span>Global managers</span><strong>{formatNumber(snapshot.meta.totalPlayers, 0)}</strong></div>
          </div>
          <button type="button" className="button button--soft button--full" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? <RefreshCw size={16} className="spin" /> : <Zap size={16} />} Trigger data engine refresh
          </button>
        </section>

        <section className="panel weight-panel">
          <div className="panel__header">
            <div><span className="panel__eyebrow">PROJECTION BLEND</span><h3>Base score inputs</h3></div>
            <Gauge size={19} className="panel__header-icon" />
          </div>
          <div className="weight-bars">
            {MODEL_WEIGHTS.map((item) => (
              <div className={`weight-bar weight-bar--${item.tone}`} key={item.label}>
                <div><span>{item.label}</span><strong>{item.value}%</strong></div>
                <i><span style={{ width: `${item.value * 2.6}%` }} /></i>
              </div>
            ))}
          </div>
          <div className="formula-box">
            <Code2 size={16} />
            <code>projection = base × minutes × availability × fixtures × strategy × momentum</code>
          </div>
          <ul className="method-list">
            <li><Sparkles size={15} /> Role score adds xGI, clean-sheet, save and defensive-contribution context.</li>
            <li><Clock size={15} /> Availability discounts doubtful, suspended and injured players.</li>
            <li><WandSparkles size={15} /> Strategy profiles adjust for ownership, confidence and ceiling.</li>
          </ul>
        </section>
      </div>

      <section className="panel data-sources-panel">
        <div className="panel__header">
          <div><span className="panel__eyebrow">UPSTREAM DATA</span><h3>Four public feeds, one normalized universe</h3></div>
          <Database size={19} className="panel__header-icon" />
        </div>
        <div className="data-source-grid">
          {DATA_SOURCES.map((source) => (
            <article className="data-source-card" key={source.title}>
              <span className="data-source-card__icon">{source.icon}</span>
              <h4>{source.title}</h4>
              <p>{source.text}</p>
              <code>{source.endpoint}</code>
            </article>
          ))}
        </div>
      </section>

      <div className="method-grid method-grid--lower">
        <section className="panel optimizer-rules-panel">
          <div className="panel__header">
            <div><span className="panel__eyebrow">OPTIMIZER RULES</span><h3>Every solution is FPL-legal</h3></div>
            <ShieldCheck size={19} className="panel__header-icon" />
          </div>
          <div className="rule-grid">
            {[
              ['15', 'players selected'],
              ['2 / 5 / 5 / 3', 'position structure'],
              ['3', 'max players per club'],
              ['11', 'starting players'],
              ['1', 'goalkeeper starts'],
              ['£100m', 'default budget'],
            ].map(([value, label]) => (
              <div key={label}><strong>{value}</strong><span>{label}</span></div>
            ))}
          </div>
          <p className="rule-copy">
            Beam search evaluates candidate squads against projected value, then each final squad is re-scored across
            legal formations with captaincy, lightly weighted bench points, and 2026/27 season rules (up to 5 banked
            free transfers and GW19 chip-half reset).
          </p>
        </section>

        <section className="panel architecture-panel">
          <div className="panel__header">
            <div><span className="panel__eyebrow">RUNTIME ARCHITECTURE</span><h3>Built to keep working</h3></div>
            <Cpu size={19} className="panel__header-icon" />
          </div>
          <div className="architecture-flow">
            <span><GlobeIcon /> FPL API</span>
            <i>→</i>
            <span><Database size={15} /> Node cache</span>
            <i>→</i>
            <span><BrainCircuit size={15} /> Model</span>
            <i>→</i>
            <span><Activity size={15} /> React UI</span>
          </div>
          <div className="architecture-details">
            <div><strong>Typed contracts</strong><span>Shared TypeScript models across API and UI.</span></div>
            <div><strong>Rate limiting</strong><span>Connection endpoints are throttled per client.</span></div>
            <div><strong>Compression & ETags</strong><span>Lower payload cost and safe cache validation.</span></div>
            <div><strong>Graceful degradation</strong><span>Live → memory cache → committed snapshot.</span></div>
          </div>
        </section>
      </div>

      <section className="panel automation-panel">
        <div className="panel__header">
          <div><span className="panel__eyebrow">ALL-AUTO OPERATIONS</span><h3>What runs without you</h3></div>
          <Zap size={19} className="panel__header-icon" />
        </div>
        <div className="automation-grid">
          {AUTOMATIONS.map((item) => (
            <article className="automation-card" key={item.title}>
              <span>{item.icon}</span>
              <h4>{item.title}</h4>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      {(videos.length > 0 || repoMeta) && (
        <section className="panel data-sources-panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">REPOSITORY INTELLIGENCE</span>
              <h3>
                @FPLVORTEX briefings & benchmark archive
                {repoMeta ? ` · ${repoMeta.benchmarkPlayers} benchmark profiles` : ''}
              </h3>
            </div>
            <a
              className="text-button"
              href={`https://www.youtube.com/channel/${repoMeta?.channelId ?? 'UCDU7nEIN72xoiR3NtxCT6CQ'}`}
              target="_blank"
              rel="noreferrer"
            >
              Visit @FPLVORTEX <ExternalLink size={13} />
            </a>
          </div>
          {videos.length > 0 && (
            <div className="data-source-grid">
              {videos.map((video) => (
                <article className="data-source-card" key={video.id}>
                  <span className="data-source-card__icon"><Play size={17} /></span>
                  <h4>{video.title}</h4>
                  <p>Published {formatDate(video.published, { day: 'numeric', month: 'short', year: 'numeric' })} on the verified @FPLVORTEX channel.</p>
                  <a className="text-button" href={video.url} target="_blank" rel="noreferrer">
                    Watch briefing <ExternalLink size={13} />
                  </a>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="panel disclaimer-panel">
        <Info size={18} />
        <div>
          <strong>Model disclaimer</strong>
          <p>
            Projections are estimates built from public data, not guaranteed FPL points or betting advice. Football is
            unpredictable: always check team news, expected minutes and your own long-term transfer plan before the deadline.
          </p>
        </div>
        <span><CircleDollarSign size={15} /> Free & open data</span>
      </section>
    </div>
  );
}

function GlobeIcon() {
  return <Database size={15} />;
}
