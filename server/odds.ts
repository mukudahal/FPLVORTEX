import {
  americanToDecimal,
  canonicalClubKey,
  solveImpliedMatchFromOdds,
  type RawMarketQuote,
} from '../src/lib/oddsMath.ts';
import type { Fixture, FixtureMarketOdds, FplTeam, MarketOddsMeta } from '../src/lib/types.ts';
import { createOddsApiFetcher } from './oddsApiKeys.ts';
import { marketCoverage } from '../src/lib/marketCoverage.ts';

const ODDS_CACHE_TTL_MS = (Number.parseInt(process.env.FPL_CACHE_ODDS_SECONDS ?? '300', 10) || 300) * 1000;
const ODDS_TIMEOUT_MS = Number.parseInt(process.env.ODDS_REQUEST_TIMEOUT_MS ?? '4500', 10) || 4500;

interface CachedQuotes {
  quotes: RawMarketQuote[];
  providerSummary: string;
  updatedAt: string;
  expiresAt: number;
  feedDiagnostics: NonNullable<MarketOddsMeta['feedDiagnostics']>;
}

let cachedQuotes: CachedQuotes | null = null;
const fetchOddsApi = createOddsApiFetcher();

function parsePositiveFloat(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = typeof val === 'number' ? val : Number.parseFloat(String(val).trim());
  return Number.isFinite(n) && n > 1.001 ? n : null;
}

/**
 * Parses CSV text (handling quoted commas cleanly) into header-keyed row objects.
 */
export function parseCsvRows(csvText: string): Array<Record<string, string>> {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const splitLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = splitLine(lines[0]);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const vals = splitLine(lines[i]);
    if (vals.length < 4) continue;
    const rec: Record<string, string> = {};
    for (let c = 0; c < headers.length; c += 1) {
      if (headers[c]) rec[headers[c]] = vals[c] ?? '';
    }
    rows.push(rec);
  }
  return rows;
}

function parseFootballDataDate(dateStr: string, timeStr?: string): string | null {
  const parts = String(dateStr || '').trim().split('/');
  if (parts.length !== 3) return null;
  const day = Number.parseInt(parts[0], 10);
  const month = Number.parseInt(parts[1], 10);
  let year = Number.parseInt(parts[2], 10);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (year < 100) year += 2000;
  const cleanTime = /^\d{2}:\d{2}$/.test(String(timeStr || '').trim()) ? `${timeStr!.trim()}:00Z` : '15:00:00Z';
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}T${cleanTime}`;
}

/**
 * Parses Football-Data.co.uk `fixtures.csv` or `E0.csv` rows (filtering `Div === 'E0'`).
 * Prioritizes Pinnacle (`PSH/PSD/PSA`, `P>2.5/P<2.5`), then Market Average (`AvgH/AvgD/AvgA`), then Bet365 (`B365H/B365D/B365A`).
 */
export function parseFootballDataCsv(csvText: string, fetchedAt = new Date().toISOString()): RawMarketQuote[] {
  const rows = parseCsvRows(csvText);
  const quotes: RawMarketQuote[] = [];

  for (const row of rows) {
    const div = (row.Div || '').trim();
    if (div && div !== 'E0') continue;
    const homeTeam = (row.HomeTeam || '').trim();
    const awayTeam = (row.AwayTeam || '').trim();
    if (!homeTeam || !awayTeam) continue;

    // Closing Pinnacle -> Opening Pinnacle -> Market Avg -> Bet365
    const tiers: Array<{
      bookmaker: string;
      h: number | null;
      d: number | null;
      a: number | null;
      over: number | null;
      under: number | null;
    }> = [
      {
        bookmaker: 'Pinnacle',
        h: parsePositiveFloat(row.PSCH) ?? parsePositiveFloat(row.PSH),
        d: parsePositiveFloat(row.PSCD) ?? parsePositiveFloat(row.PSD),
        a: parsePositiveFloat(row.PSCA) ?? parsePositiveFloat(row.PSA),
        over: parsePositiveFloat(row['PC>2.5']) ?? parsePositiveFloat(row['P>2.5']),
        under: parsePositiveFloat(row['PC<2.5']) ?? parsePositiveFloat(row['P<2.5']),
      },
      {
        bookmaker: 'Market Avg',
        h: parsePositiveFloat(row.AvgCH) ?? parsePositiveFloat(row.AvgH),
        d: parsePositiveFloat(row.AvgCD) ?? parsePositiveFloat(row.AvgD),
        a: parsePositiveFloat(row.AvgCA) ?? parsePositiveFloat(row.AvgA),
        over: parsePositiveFloat(row['AvgC>2.5']) ?? parsePositiveFloat(row['Avg>2.5']),
        under: parsePositiveFloat(row['AvgC<2.5']) ?? parsePositiveFloat(row['Avg<2.5']),
      },
      {
        bookmaker: 'Bet365',
        h: parsePositiveFloat(row.B365CH) ?? parsePositiveFloat(row.B365H),
        d: parsePositiveFloat(row.B365CD) ?? parsePositiveFloat(row.B365D),
        a: parsePositiveFloat(row.B365CA) ?? parsePositiveFloat(row.B365A),
        over: parsePositiveFloat(row['B365C>2.5']) ?? parsePositiveFloat(row['B365>2.5']),
        under: parsePositiveFloat(row['B365C<2.5']) ?? parsePositiveFloat(row['B365<2.5']),
      },
    ];

    const chosen = tiers.find((t) => t.h && t.d && t.a);
    if (!chosen || !chosen.h || !chosen.d || !chosen.a) continue;

    // Supplement totals from Market Avg / Bet365 if Pinnacle 1X2 was present without totals
    const totalsSource = [chosen, ...tiers].find(tier => tier.over && tier.under);
    const fallbackOver = totalsSource?.over ?? null;
    const fallbackUnder = totalsSource?.under ?? null;

    quotes.push({
      provider: 'football-data',
      bookmaker: chosen.bookmaker,
      homeTeam,
      awayTeam,
      kickoffTime: parseFootballDataDate(row.Date ?? '', row.Time),
      oddsHome: chosen.h,
      oddsDraw: chosen.d,
      oddsAway: chosen.a,
      totalLine: fallbackOver && fallbackUnder ? 2.5 : null,
      oddsOver: fallbackOver,
      oddsUnder: fallbackUnder,
      updatedAt: '',
      quoteTimeSource: 'unknown',
      retrievedAt: fetchedAt,
    });
  }

  return quotes;
}

/**
 * Parses The Odds API v4 `/v4/sports/soccer_epl/odds` response (`markets=h2h,totals&oddsFormat=decimal`).
 * Prioritizes sharp books (`pinnacle`, `betfair_ex_uk`, `matchbook`) or computes consensus average across UK/EU books.
 */
export function parseTheOddsApiEvents(events: unknown, fetchedAt = new Date().toISOString()): RawMarketQuote[] {
  if (!Array.isArray(events)) return [];
  const sharpPriority = ['pinnacle', 'betfair_ex_uk', 'betfair_ex_eu', 'matchbook'];
  const quotes: RawMarketQuote[] = [];

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const rec = ev as Record<string, any>;
    const homeTeam = String(rec.home_team || '').trim();
    const awayTeam = String(rec.away_team || '').trim();
    const kickoffTime = typeof rec.commence_time === 'string' ? rec.commence_time : null;
    const bookmakers: Array<Record<string, any>> = Array.isArray(rec.bookmakers) ? rec.bookmakers : [];
    if (!homeTeam || !awayTeam || bookmakers.length === 0) continue;

    const extractFromBook = (book: Record<string, any>) => {
      const markets: Array<Record<string, any>> = Array.isArray(book.markets) ? book.markets : [];
      const h2h = markets.find((m) => m.key === 'h2h');
      const totals = markets.find((m) => m.key === 'totals');
      if (!h2h || !Array.isArray(h2h.outcomes)) return null;

      let h: number | null = null;
      let d: number | null = null;
      let a: number | null = null;
      for (const out of h2h.outcomes) {
        const name = String(out?.name || '').trim();
        const price = parsePositiveFloat(out?.price);
        if (!price) continue;
        if (canonicalClubKey(name) === canonicalClubKey(homeTeam)) h = price;
        else if (canonicalClubKey(name) === canonicalClubKey(awayTeam)) a = price;
        else if (name.toLowerCase() === 'draw') d = price;
      }
      if (!h || !d || !a) return null;

      let totalLine: number | null = null;
      let oddsOver: number | null = null;
      let oddsUnder: number | null = null;
      if (totals && Array.isArray(totals.outcomes)) {
        const byPoint = new Map<number, { over?: number; under?: number }>();
        for (const out of totals.outcomes) {
          const pt = Number(out?.point);
          const price = parsePositiveFloat(out?.price);
          const side = String(out?.name || '').toLowerCase();
          if (!Number.isFinite(pt) || !price) continue;
          const slot = byPoint.get(pt) ?? {};
          if (side === 'over') slot.over = price;
          if (side === 'under') slot.under = price;
          byPoint.set(pt, slot);
        }
        const completePoints = [...byPoint.entries()]
          .filter(([, v]) => v.over && v.under)
          .sort((p1, p2) => Math.abs(p1[0] - 2.5) - Math.abs(p2[0] - 2.5));
        if (completePoints.length > 0) {
          totalLine = completePoints[0][0];
          oddsOver = completePoints[0][1].over ?? null;
          oddsUnder = completePoints[0][1].under ?? null;
        }
      }

      return {
        bookTitle: String(book.title || book.key || 'Bookmaker'),
        updatedAt: typeof book.last_update === 'string' && Number.isFinite(Date.parse(book.last_update)) ? book.last_update : '',
        quoteTimeSource: typeof book.last_update === 'string' && Number.isFinite(Date.parse(book.last_update)) ? 'bookmaker' as const : 'unknown' as const,
        h,
        d,
        a,
        totalLine,
        oddsOver,
        oddsUnder,
      };
    };

    let selected: ReturnType<typeof extractFromBook> = null;
    for (const sharpKey of sharpPriority) {
      const sharpBook = bookmakers.find((b) => String(b.key || '').toLowerCase() === sharpKey);
      if (sharpBook) {
        selected = extractFromBook(sharpBook);
        if (selected) break;
      }
    }

    if (!selected) {
      const parsedAll = bookmakers.map(extractFromBook).filter((x): x is NonNullable<typeof x> => Boolean(x));
      if (parsedAll.length === 0) continue;
      const avg = (vals: number[]) => vals.reduce((s, v) => s + v, 0) / vals.length;
      const with25 = parsedAll.filter((b) => b.totalLine === 2.5 && b.oddsOver && b.oddsUnder);
      selected = {
        bookTitle: parsedAll.length > 1 ? `Consensus (${parsedAll.length} books)` : parsedAll[0].bookTitle,
        // A blended price has no single bookmaker timestamp. Only claim provenance
        // when every contributing book reports a source quote time.
        updatedAt: parsedAll.every(b => b.quoteTimeSource === 'bookmaker')
          ? parsedAll.map(b => b.updatedAt).sort()[0] : '',
        quoteTimeSource: parsedAll.every(b => b.quoteTimeSource === 'bookmaker') ? 'bookmaker' as const : 'unknown' as const,
        h: avg(parsedAll.map((b) => b.h)),
        d: avg(parsedAll.map((b) => b.d)),
        a: avg(parsedAll.map((b) => b.a)),
        totalLine: with25.length > 0 ? 2.5 : parsedAll[0].totalLine,
        oddsOver: with25.length > 0 ? avg(with25.map((b) => b.oddsOver!)) : parsedAll[0].oddsOver,
        oddsUnder: with25.length > 0 ? avg(with25.map((b) => b.oddsUnder!)) : parsedAll[0].oddsUnder,
      };
    }

    quotes.push({
      provider: 'the-odds-api',
      bookmaker: selected.bookTitle,
      homeTeam,
      awayTeam,
      kickoffTime,
      oddsHome: selected.h,
      oddsDraw: selected.d,
      oddsAway: selected.a,
      totalLine: selected.totalLine,
      oddsOver: selected.oddsOver,
      oddsUnder: selected.oddsUnder,
      updatedAt: selected.updatedAt,
      quoteTimeSource: selected.quoteTimeSource,
      retrievedAt: fetchedAt,
    });
  }

  return quotes;
}

/**
 * Parses ESPN's public EPL scoreboard JSON (`site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard`)
 * which embeds 3-way moneyline + Over/Under odds on upcoming Premier League fixtures.
 */
export function parseEspnScoreboardOdds(payload: unknown, fetchedAt = new Date().toISOString()): RawMarketQuote[] {
  if (!payload || typeof payload !== 'object') return [];
  const events = Array.isArray((payload as Record<string, any>).events)
    ? ((payload as Record<string, any>).events as Array<Record<string, any>>)
    : [];
  const quotes: RawMarketQuote[] = [];

  for (const ev of events) {
    const comp = Array.isArray(ev?.competitions) ? ev.competitions[0] : null;
    if (!comp) continue;
    const competitors: Array<Record<string, any>> = Array.isArray(comp.competitors) ? comp.competitors : [];
    const homeComp = competitors.find((c) => c.homeAway === 'home');
    const awayComp = competitors.find((c) => c.homeAway === 'away');
    const homeTeam = String(homeComp?.team?.displayName || homeComp?.team?.shortDisplayName || '').trim();
    const awayTeam = String(awayComp?.team?.displayName || awayComp?.team?.shortDisplayName || '').trim();
    if (!homeTeam || !awayTeam) continue;

    const oddsArr: Array<Record<string, any>> = Array.isArray(comp.odds) ? comp.odds : [];
    for (const oddObj of oddsArr) {
      const hMoney = Number(oddObj?.homeTeamOdds?.moneyLine ?? oddObj?.moneyline?.home?.close?.odds);
      const aMoney = Number(oddObj?.awayTeamOdds?.moneyLine ?? oddObj?.moneyline?.away?.close?.odds);
      const dMoney = Number(oddObj?.drawOdds?.moneyLine ?? oddObj?.moneyline?.draw?.close?.odds);

      const hDec = americanToDecimal(hMoney);
      const dDec = americanToDecimal(dMoney);
      const aDec = americanToDecimal(aMoney);
      if (!hDec || !dDec || !aDec) continue;

      const overUnderLine = Number(oddObj?.overUnder);
      const overDec = americanToDecimal(Number(oddObj?.overOdds ?? oddObj?.total?.over?.close?.odds));
      const underDec = americanToDecimal(Number(oddObj?.underOdds ?? oddObj?.total?.under?.close?.odds));
      const providerName = String(oddObj?.provider?.name || 'Sportsbook');

      quotes.push({
        provider: 'espn',
        bookmaker: providerName,
        homeTeam,
        awayTeam,
        kickoffTime: typeof ev.date === 'string' ? ev.date : null,
        oddsHome: hDec,
        oddsDraw: dDec,
        oddsAway: aDec,
        totalLine: Number.isFinite(overUnderLine) && overDec && underDec ? overUnderLine : null,
        oddsOver: overDec,
        oddsUnder: underDec,
        updatedAt: '',
        quoteTimeSource: 'unknown',
        retrievedAt: fetchedAt,
      });
      break;
    }
  }

  return quotes;
}

/**
 * Matches parsed bookmaker quotes onto normalized FPL fixtures by canonical `(home, away)` club keys
 * and kickoff proximity (within 7 days when both timestamps exist, preventing reverse-fixture collisions).
 */
export function matchQuotesToFixtures(
  teams: FplTeam[],
  fixtures: Fixture[],
  quotes: RawMarketQuote[],
): Map<number, FixtureMarketOdds> {
  const teamCanonicalById = new Map<number, string>();
  for (const t of teams) {
    teamCanonicalById.set(t.id, canonicalClubKey(t.name));
  }

  // Provider priority: the-odds-api (1) > football-data (2) > espn (3)
  const providerRank: Record<RawMarketQuote['provider'], number> = {
    'the-odds-api': 1,
    'football-data': 2,
    espn: 3,
  };
  const orderedQuotes = [...quotes].sort((a, b) => providerRank[a.provider] - providerRank[b.provider]);

  const matched = new Map<number, FixtureMarketOdds>();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  for (const fx of fixtures) {
    const hKey = teamCanonicalById.get(fx.teamH);
    const aKey = teamCanonicalById.get(fx.teamA);
    if (!hKey || !aKey) continue;

    const fxTime = fx.kickoffTime ? Date.parse(fx.kickoffTime) : Number.NaN;
    let bestQuote: RawMarketQuote | null = null;

    for (const q of orderedQuotes) {
      if (canonicalClubKey(q.homeTeam) !== hKey || canonicalClubKey(q.awayTeam) !== aKey) continue;
      if (Number.isFinite(fxTime) && q.kickoffTime) {
        const qTime = Date.parse(q.kickoffTime);
        if (Number.isFinite(qTime) && Math.abs(fxTime - qTime) > SEVEN_DAYS_MS) {
          continue;
        }
      }
      bestQuote = q;
      break;
    }

    if (bestQuote) {
      const solved = solveImpliedMatchFromOdds(bestQuote);
      if (solved) matched.set(fx.id, {
        ...solved,
        updatedAt: bestQuote.quoteTimeSource === 'bookmaker' ? bestQuote.updatedAt ?? '' : '',
        quoteTimeSource: bestQuote.quoteTimeSource ?? 'unknown',
        retrievedAt: bestQuote.retrievedAt ?? '',
      });
    }
  }

  return matched;
}

async function fetchTextSafe(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(ODDS_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 FPL-VORTEX/4.0',
        Accept: 'text/csv,application/json,text/plain,*/*',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function formatYyyyMmDd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

async function loadLiveMarketQuotes(force = false): Promise<CachedQuotes> {
  if (!force && cachedQuotes && cachedQuotes.expiresAt > Date.now()) {
    return cachedQuotes;
  }

  const nowIso = new Date().toISOString();
  const allQuotes: RawMarketQuote[] = [];
  const activeProviders: string[] = [];
  const feedDiagnostics: NonNullable<MarketOddsMeta['feedDiagnostics']> = [];
  const oddsApiKey = (process.env.ODDS_API_KEY ?? '').trim();
  const oddsApiBackup = (process.env.ODDS_API_KEY_BACKUP ?? '').trim();

  // 1) Optional Tier-1 Real-Time Sharp Feed (The Odds API v4 — soccer_epl)
  let oddsApiBody: string | null = null;
  let oddsApiRows = 0;
  if (oddsApiKey || oddsApiBackup) {
    oddsApiBody = await fetchOddsApi(oddsApiKey, oddsApiBackup, ODDS_TIMEOUT_MS);
    if (oddsApiBody) {
      try {
        const parsed = parseTheOddsApiEvents(JSON.parse(oddsApiBody), nowIso);
        oddsApiRows = parsed.length;
        if (parsed.length > 0) {
          allQuotes.push(...parsed);
          activeProviders.push('The Odds API (Pinnacle/UK-EU)');
        }
      } catch {
        // Ignore malformed response and continue to keyless feeds.
      }
    }
  }
  feedDiagnostics.push({
    provider: 'The Odds API',
    access: oddsApiKey || oddsApiBackup ? 'configured' : 'not-configured',
    fetched: oddsApiBody !== null,
    parsedRows: oddsApiRows,
  });

  // 2) Keyless Free Live Feeds (Football-Data.co.uk upcoming fixtures.csv + season E0.csv + ESPN EPL Scoreboard)
  const startWindow = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
  const endWindow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${formatYyyyMmDd(startWindow)}-${formatYyyyMmDd(endWindow)}`;

  const [fixturesCsv, season2627Csv, season2526Csv, espnBody] = await Promise.all([
    fetchTextSafe('https://www.football-data.co.uk/fixtures.csv'),
    fetchTextSafe('https://www.football-data.co.uk/mmz4281/2627/E0.csv'),
    fetchTextSafe('https://www.football-data.co.uk/mmz4281/2526/E0.csv'),
    fetchTextSafe(espnUrl),
  ]);

  let fdCount = 0;
  for (const [name, csv] of [
    ['Football-Data upcoming fixtures', fixturesCsv],
    ['Football-Data 2026/27', season2627Csv],
    ['Football-Data 2025/26 archive', season2526Csv],
  ] as const) {
    const parsed = csv ? parseFootballDataCsv(csv, nowIso) : [];
    fdCount += parsed.length;
    allQuotes.push(...parsed);
    feedDiagnostics.push({ provider: name, access: 'public', fetched: csv !== null, parsedRows: parsed.length });
  }
  if (fdCount > 0) activeProviders.push('Football-Data (Pinnacle/Market Avg)');

  let espnCount = 0;
  if (espnBody) {
    try {
      const espnQuotes = parseEspnScoreboardOdds(JSON.parse(espnBody), nowIso);
      espnCount = espnQuotes.length;
      if (espnQuotes.length > 0) {
        allQuotes.push(...espnQuotes);
        activeProviders.push('ESPN Sportsbook');
      }
    } catch {
      // Ignore malformed JSON.
    }
  }

  feedDiagnostics.push({ provider: 'ESPN EPL scoreboard', access: 'public', fetched: espnBody !== null, parsedRows: espnCount });
  const result: CachedQuotes = {
    quotes: allQuotes,
    providerSummary: activeProviders.length > 0 ? activeProviders.join(' + ') : 'Repo Poisson Model (Offline)',
    updatedAt: nowIso,
    feedDiagnostics,
    expiresAt: Date.now() + (allQuotes.length > 0 ? ODDS_CACHE_TTL_MS : 60_000),
  };
  cachedQuotes = result;
  return result;
}

/**
 * Enriches FPL fixtures with live bookmaker implied Goals (`homeXg`, `awayXg`),
 * Clean Sheet % (`homeCs`, `awayCs`), and Fair 1X2 Win/Draw % whenever live market quotes are available.
 */
export function oddsCoverage(fixtures: Fixture[], nextEventId: number): { matched: number; upcoming: number; status: MarketOddsMeta['status'] } {
  const next = fixtures.filter(fixture => fixture.event === nextEventId);
  const matched = next.filter(fixture => Boolean(fixture.marketOdds)).length;
  const coverage = marketCoverage(next, nextEventId, 1);
  return { matched, upcoming: next.length, status: coverage.completeMarketData ? 'live' : matched > 0 ? 'partial' : 'fallback' };
}

export async function enrichFixturesWithLiveOdds(
  teams: FplTeam[],
  fixtures: Fixture[],
  nextEventId: number,
  force = false,
): Promise<{ fixtures: Fixture[]; oddsMeta: MarketOddsMeta }> {
  const apiKeyConfigured = Boolean((process.env.ODDS_API_KEY ?? '').trim() || (process.env.ODDS_API_KEY_BACKUP ?? '').trim());
  const nextGwFixtures = fixtures.filter((fx) => fx.event === nextEventId);

  if (process.env.VORTEX_OFFLINE === '1') {
    return {
      fixtures,
      oddsMeta: {
        status: 'fallback',
        provider: 'Repo Poisson Model (Offline)',
        matchedFixtures: 0,
        matchedUpcomingFixtures: 0,
        upcomingFixtures: nextGwFixtures.length,
        apiKeyConfigured,
        updatedAt: new Date().toISOString(),
        next3Coverage: marketCoverage(fixtures, nextEventId),
        feedDiagnostics: [],
      },
    };
  }

  const loaded = await loadLiveMarketQuotes(force);
  if (loaded.quotes.length === 0) {
    return {
      fixtures,
      oddsMeta: {
        status: 'fallback',
        provider: 'Repo Poisson Model (Offline)',
        matchedFixtures: 0,
        matchedUpcomingFixtures: 0,
        upcomingFixtures: nextGwFixtures.length,
        apiKeyConfigured,
        updatedAt: loaded.updatedAt,
        next3Coverage: marketCoverage(fixtures, nextEventId),
        feedDiagnostics: loaded.feedDiagnostics,
      },
    };
  }

  const matchedMap = matchQuotesToFixtures(teams, fixtures, loaded.quotes);
  const enrichedFixtures = fixtures.map((fx) => {
    const marketOdds = matchedMap.get(fx.id);
    return marketOdds ? { ...fx, marketOdds } : fx;
  });

  const { matched: nextGwMatched, status } = oddsCoverage(enrichedFixtures, nextEventId);

  return {
    fixtures: enrichedFixtures,
    oddsMeta: {
      status,
      provider: matchedMap.size > 0 ? loaded.providerSummary : 'Repo Poisson Model',
      matchedFixtures: matchedMap.size,
      matchedUpcomingFixtures: nextGwMatched,
      upcomingFixtures: nextGwFixtures.length,
      apiKeyConfigured,
      updatedAt: loaded.updatedAt,
      next3Coverage: marketCoverage(enrichedFixtures, nextEventId),
      feedDiagnostics: loaded.feedDiagnostics,
    },
  };
}
