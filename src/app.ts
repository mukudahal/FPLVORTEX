import {
  csvForPlayers, demoPlayers, fixtureDifficulty, initialSquad,
  optimizeOneTransfer, parseSquad, projectPlayer, projectedHorizon, validateSquad,
  type Player, type Position, type SquadSnapshot
} from './model.js';
import { forecastVortex, type AppearanceSummary, type Appearance } from './vortex-analytics.js';
import { solveDeepPlan, type DeepPlan } from './deep-solver.js';
import { buildRankChaseAdvice, parseRankChaseProfile, TARGET_GW, TARGET_RANK, AVAILABLE_CHIPS, type RankChaseProfile, type RankChaseAdvice } from './rank-chase.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing application root');
const appRoot: HTMLElement = root;

const pages = [
  { slug: 'overview', label: 'Command Center', icon: '◫', category: 'workspace' },
  { slug: 'squad', label: 'Squad Forge', icon: '♙', category: 'workspace' },
  { slug: 'chase', label: 'Top 5K · GW19', icon: '♛', category: 'workspace' },
  { slug: 'players', label: 'Player Intelligence', icon: '◎', category: 'workspace' },
  { slug: 'fixtures', label: 'Fixture Matrix', icon: '▦', category: 'workspace' },
  { slug: 'goals', label: 'Goals + Assists', icon: '◎', category: 'intelligence' },
  { slug: 'cleansheets', label: 'Clean Sheet Lab', icon: '◉', category: 'intelligence' },
  { slug: 'solver', label: 'Deep Solver', icon: '◇', category: 'intelligence' },
  { slug: 'strategy', label: 'Strategy Engine', icon: '✧', category: 'intelligence' },
  { slug: 'model', label: 'Model Lab', icon: '◈', category: 'intelligence' },
  { slug: 'prices', label: 'Price Pulse', icon: '↗', category: 'intelligence' },
  { slug: 'review', label: 'Performance Journal', icon: '▤', category: 'intelligence' },
  { slug: 'data', label: 'Data Studio', icon: '◉', category: 'intelligence' }
] as const;
type Page = typeof pages[number]['slug'];
const byId = new Map(demoPlayers.map(player => [player.id, player]));
const teamColors: Record<string, string> = { MCI: '#b9e7fa', ARS: '#ed5553', LIV: '#dc4c52', CHE: '#3976e0', MUN: '#d94a47', AVL: '#a75b82', BHA: '#2e71d9', NEW: '#474f62', TOT: '#bbc4d8', EVE: '#4f78d9' };
const communityPortraits: Record<number,{file:string;credit:string;source:string;license:string}> = {
  1: {file:'Erling_Haaland_France_v_Norway_26_June_26-008.jpg',credit:'Bryan Berlin / WikiPortraits',source:'https://commons.wikimedia.org/wiki/File:Erling_Haaland_France_v_Norway_26_June_26-008.jpg',license:'CC BY-SA 4.0'},
  2: {file:'Bukayo_Saka_England_v_Panama_27_June_26-108_(cropped).jpg',credit:'Bryan Berlin / WikiPortraits',source:'https://commons.wikimedia.org/wiki/File:Bukayo_Saka_England_v_Panama_27_June_26-108_(cropped).jpg',license:'CC BY-SA 4.0'},
  7: {file:'Ollie_Watkins_England_v_Ghana_23_June_2026-076.jpg',credit:'Bryan Berlin / WikiPortraits',source:'https://commons.wikimedia.org/wiki/File:Ollie_Watkins_England_v_Ghana_23_June_2026-076.jpg',license:'CC BY-SA 4.0'},
  11: {file:'Virgil_van_Dijk_06042025_(1).jpg',credit:'Timmy96',source:'https://commons.wikimedia.org/wiki/File:Virgil_van_Dijk_06042025_(1).jpg',license:'CC0 1.0'},
  22: {file:'Eberechi_Eze_England_v_Panama_27_June_26-231.jpg',credit:'Bryan Berlin / WikiPortraits',source:'https://commons.wikimedia.org/wiki/File:Eberechi_Eze_England_v_Panama_27_June_26-231.jpg',license:'CC BY-SA 4.0'}
};
const clubNames: Record<string, string> = { MCI: 'Manchester City', ARS: 'Arsenal', LIV: 'Liverpool', CHE: 'Chelsea', MUN: 'Manchester United', AVL: 'Aston Villa', BHA: 'Brighton', NEW: 'Newcastle', TOT: 'Tottenham', EVE: 'Everton' };
const sampleFixtures: Record<string, string[]> = { ARS: ['NFO H','EVE H','LIV A','HUL H','NEW A'], MCI: ['IPS H','AVL A','BHA H','NFO A','FUL H'], LIV: ['CHE A','BOU H','ARS H','MCI A','EVE H'], CHE: ['EVE A','TOT H','MUN H','SUN A','LEE H'], AVL: ['MCI H','BHA A','NEW H','CHE A','FUL H'], MUN: ['BOU H','NEW A','CHE A','BRE H','ARS A'], NEW: ['LIV H','MUN H','AVL A','BHA H','ARS H'], BHA: ['WOL A','AVL H','MCI A','NEW A','TOT H'], TOT: ['FUL A','CHE A','WHU H','EVE H','BHA A'], EVE: ['CHE H','ARS A','TOT A','MUN H','LIV A'] };
const appearanceSummaries = new Map<number,AppearanceSummary>();
const appearanceRows = new Map<number,Appearance[]>();
function advancedForecast(player:Player,period:number){return forecastVortex(player,period,appearanceRows.get(player.id)??[],appearanceStatus==='licensed');}
let appearanceStatus: 'unrequested' | 'loading' | 'licensed' | 'unavailable' = 'unrequested';
let solvedPlan: DeepPlan | null = null;
let rankProfile:RankChaseProfile = (()=>{
  try { return parseRankChaseProfile(JSON.parse(window.localStorage.getItem('fplvortex-rank-chase-v1')||'null')); }
  catch { return parseRankChaseProfile(null); }
})();
let rankAdvice:RankChaseAdvice|null=null;
type LiveEntrySquad = {fetchedAt:string;chipsPlayed:{name:string;gameweek:number}[];bankInTenths:number|null;teamValueInTenths:number|null;picks:{gameweek:number;players:{id:number;name:string|null;club:string|null;positionName:string|null;multiplier:number|null;isCaptain:boolean;isViceCaptain:boolean;priceTenths:number|null;officialStatus:string|null}[]}|null};
let liveEntrySquad:LiveEntrySquad|null=null;
let liveRankStatus: 'idle'|'loading'|'verified'|'failed'|'manual' = 'idle';
let liveRankDetail = 'No live entry sync performed in this browser session.';

let lastAdviceKey='';
function cachedRankAdvice():RankChaseAdvice {
  const signature=JSON.stringify([state.gw,state.squad,rankProfile]);
  if(!rankAdvice||signature!==lastAdviceKey){
    rankAdvice=buildRankChaseAdvice(demoPlayers,state.squad,state.gw,rankProfile);
    lastAdviceKey=signature;
  }
  return rankAdvice;
}

const saved = (() => { try { return window.localStorage.getItem('fplvortex-demo-squad-v1'); } catch { return null; } })();
const state: { page: Page; gw: number; horizon: number; search: string; position: 'ALL' | Position; squad: SquadSnapshot; sort: 'forecast' | 'price' | 'ownership'; menuOpen: boolean; notice: string; fixtureSortGw: number; goalSort:'goals'|'assists'|'total'; priceDirection:'rise'|'fall' } = {
  page: getCurrentPage(), gw: 7, horizon: 5, search: '', position: 'ALL', squad: parseSquad(saved), sort: 'forecast', menuOpen: false, notice: '', fixtureSortGw: 7, goalSort:'goals', priceDirection:'rise'
};

function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
function getCurrentPage(): Page {
  const fragment = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return pages.find(page => page.slug === fragment)?.slug ?? 'overview';
}
function portrait(player: Player, size: 'small' | 'medium' | 'large' = 'small'): string {
  const initials = player.name.split(' ').map(part => part[0]).slice(-2).join('');
  const fallback = `<span class="portrait-fallback">${escapeHtml(initials)}</span>`;
  const openPortrait=communityPortraits[player.id];
  const legalImage=openPortrait ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(openPortrait.file)}?width=150` : '';
  return `<span class="portrait portrait-${size}" style="--team-color:${teamColors[player.club] ?? '#cae2db'}">${fallback}${legalImage ? `<img loading="lazy" src="${legalImage}" alt="Portrait of ${escapeHtml(player.name)}" title="${escapeHtml(openPortrait?.credit ?? "Unknown") } · ${escapeHtml(openPortrait?.license ?? "Unspecified")}" />` : ''}</span>`;
}
function badgeFdr(level: number, detail = ''): string {
  return `<span class="fdr fdr-${fixtureDifficulty(level)}" title="${escapeHtml(`Difficulty ${level} / 5`)}">${escapeHtml(detail || String(level))}</span>`;
}
function currentHorizonPoints(player:Player):number {
  const offset=state.gw-7;
  const sum=Array.from({length:Math.min(state.horizon,10-offset)},(_,index)=>advancedForecast(player,offset+index+1).expectedPoints).reduce((total,points)=>total+points,0);
  return Math.round(sum*10)/10;
}
function playerRow(player: Player, rank: number): string {
  const pts = currentHorizonPoints(player);
  const history = appearanceSummaries.get(player.id);
  const forecast=advancedForecast(player,state.gw-6);
  return `<tr>
    <td><span class="table-rank">${String(rank).padStart(2,'0')}</span></td>
    <td><div class="player-identity">${portrait(player)}<div><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.club)} <span class="dot-sep">·</span> ${escapeHtml(player.position)}</small></div></div></td>
    <td class="tabular">£${player.price.toFixed(1)}m</td>
    <td class="tabular">${player.ownership.toFixed(1)}%</td>
    <td><div class="fixture-inline">${player.fixtures.slice(0,3).map(level => badgeFdr(level)).join('')}</div></td>
    <td class="tabular"><span class="availability availability-${player.status}">${escapeHtml(player.status)}</span></td>
    <td class="tabular" title="Research-model probability of starting this gameweek">${Math.round(forecast.startProbability*100)}%</td>
    <td class="tabular" title="Actual starts / completed GWs, excluding substitute appearances"><strong>${history ? history.startsDisplay : '—'}</strong></td>
    <td class="tabular" title="Games played from the bench">${history ? history.substituteAppearances : '—'}</td>
    <td class="tabular" title="Substituted off after starting">${history ? history.substitutedOff : '—'}</td>
    <td class="tabular" title="Actual average minutes per appearance">${history ? history.minutesPerAppearance.toFixed(1) : '—'}</td>
    <td class="tabular" title="Actual cumulative ninety-minute equivalents">${history ? history.ninetyEquivalents.toFixed(2) : '—'}</td>
    <td class="tabular">${player.expectedMinutes}′</td>
    <td class="tabular"><span class="stat-bold">${pts.toFixed(1)}</span></td>
    <td><button class="icon-button add-player" data-player="${player.id}" title="Compare player">↗</button></td>
  </tr>`;
}
function navMarkup(): string {
  return `<aside class="sidebar ${state.menuOpen ? 'sidebar-open' : ''}">
    <a class="sidebar-brand" href="#/overview" aria-label="FPLVORTEX home"><img class="brand-logo" src="/assets/fplvortex-logo.webp" alt="FPLVORTEX crowned lion logo" /><span class="brand-tagline">FANTASY INTELLIGENCE</span></a>
    <div class="sidebar-divider"></div>
    <p class="nav-caption">WORKSPACE</p>
    <nav aria-label="Primary navigation">${pages.filter(page => page.category === 'workspace').map(page => navItem(page)).join('')}</nav>
    <p class="nav-caption nav-caption-second">INTELLIGENCE SUITE</p>
    <nav aria-label="Analytics navigation">${pages.filter(page => page.category === 'intelligence').map(page => navItem(page)).join('')}</nav>
    <div class="sidebar-bottom"><div class="status-circle"></div><div><strong>Vortex Studio</strong><small>Prototype environment</small></div><span class="sidebar-bottom-arrow">↗</span></div>
  </aside>`;
}
function navItem(page: typeof pages[number]): string {
  return `<a href="#/${page.slug}" class="nav-link ${state.page === page.slug ? 'active' : ''}" ${state.page === page.slug ? 'aria-current="page"' : ''}><span class="nav-icon">${page.icon}</span><span>${page.label}</span>${page.slug === 'strategy' ? '<span class="nav-new">NEW</span>' : ''}</a>`;
}
function shell(content: string): string {
  const title = pages.find(page => page.slug === state.page)?.label || 'Command Center';
  return `${navMarkup()}<div class="app-shell"><header class="topbar">
    <div class="topbar-left"><button class="mobile-toggle" id="mobile-toggle" aria-label="Open menu">☰</button><div class="breadcrumbs">Platform <span>/</span> <strong>${escapeHtml(title)}</strong></div></div>
    <div class="topbar-right"><span class="demo-indicator"><span class="demo-dot"></span> ILLUSTRATIVE DATA</span><span class="header-divider"></span><span class="topbar-avatar">FV</span></div>
  </header><main class="main-content">${content}</main><footer class="page-footer"><span>© 2026 FPLVORTEX · Independent fantasy intelligence.</span><span>Prototype dataset · No real-time predictions</span></footer></div>${state.notice ? `<div class="toast" role="status">${escapeHtml(state.notice)}</div>` : ''}`;
}
function header(title: string, subtitle: string, kicker: string, actions = ''): string {
  return `<div class="page-heading"><div><span class="eyebrow"><span class="eyebrow-dash"></span>${escapeHtml(kicker)}</span><h1>${title}</h1><p>${escapeHtml(subtitle)}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function globalFilters(): string {
  return `<div class="control-row"><div class="select-wrapper"><span>Season</span><strong>2026/27</strong><span>⌄</span></div><label class="select-wrapper"><span>Gameweek</span><select id="gw-select" aria-label="Gameweek">${Array.from({length: 10}, (_, index) => `<option value="${7+index}" ${state.gw === 7+index ? 'selected' : ''}>GW ${7+index}</option>`).join('')}</select></label><label class="select-wrapper"><span>Horizon</span><select id="horizon-select" aria-label="Projection horizon">${[1,2,3,4,5,6,7,8,9,10].filter(value=>value<=17-state.gw).map(value => `<option value="${value}" ${value === state.horizon ? 'selected' : ''}>${value} ${value===1?'week':'weeks'}</option>`).join('')}</select></label></div>`;
}
function miniBars(data: number[]): string {
  const max = Math.max(...data, 1);
  return `<div class="mini-bars" aria-label="Illustrative forecast trend">${data.map((value, index) => `<span style="height:${Math.max(12,Math.round(value/max*100))}%" class="${index===data.length-2?'accent-bar':''}"></span>`).join('')}</div>`;
}
function dashboard(): string {
  const selected = state.squad.selectedIds.map(id => byId.get(id)).filter((player): player is Player => Boolean(player));
  const totals = selected.map(player => ({player, projection: advancedForecast(player, state.gw-6).expectedPoints})).sort((a,b)=>b.projection-a.projection);
  const top11 = totals.slice(0,11);
  const topCaptain = [...top11].sort((a,b)=>b.projection-a.projection)[0];
  const expected = top11.reduce((sum,p)=>sum+p.projection,0) + (topCaptain?.projection ?? 0);
  const highest = [...demoPlayers].sort((a,b)=>currentHorizonPoints(b)-currentHorizonPoints(a)).slice(0,5);
  return `${header('Your edge, <span class="title-accent">engineered.</span>', 'An intelligent command center for sharper fantasy decisions.', 'FPLVORTEX / COMMAND CENTER', '<a class="button button-primary" href="#/chase">Top 5K GW19 plan <span>↗</span></a>')}
    ${globalFilters()}
    <section class="hero-banner"><div class="hero-copy"><span class="hero-tag">THE VORTEX ADVANTAGE <span>✦</span></span><h2>See the game<br/><em>before it happens.</em></h2><p>Forecasts, fixtures and smarter squad decisions — designed to keep you ahead of the curve.</p><a href="#/strategy" class="hero-cta">Explore Strategy Engine <span>↗</span></a></div><div class="hero-art"><img src="/assets/fplvortex-logo.webp" alt="FPLVORTEX crowned lion logo" /></div><span class="hero-number">01 / 04</span></section>
    <div class="section-top"><div><h2>At a glance</h2><p>Illustrative forecast signals for GW ${state.gw}</p></div><span class="section-hint">Updated in demo mode <span class="green-dot"></span></span></div>
    <div class="kpi-grid"><div class="kpi-card"><div class="kpi-head"><span>Projected squad points</span><span class="kpi-icon kpi-icon-green">↗</span></div><div class="kpi-value">${expected.toFixed(1)} <small>xPts</small></div><div class="kpi-foot"><span class="up-tag">+6.8%</span> Illustrative trend</div>${miniBars([39,44,42,49,46,58,52,expected])}</div>
    <div class="kpi-card"><div class="kpi-head"><span>Bank available</span><span class="kpi-icon kpi-icon-blue">£</span></div><div class="kpi-value">£${state.squad.bank.toFixed(1)}<small>m</small></div><div class="kpi-foot">Across your saved demo squad</div><div class="kpi-secondary"><span>Free transfers</span><strong>${state.squad.freeTransfers}</strong></div></div>
    <div class="kpi-card"><div class="kpi-head"><span>Captaincy signal</span><span class="kpi-icon kpi-icon-purple">✧</span></div><div class="kpi-captain">${topCaptain ? portrait(topCaptain.player) : ''}<div><strong>${escapeHtml(topCaptain?.player.name ?? '—')}</strong><small>${escapeHtml(topCaptain?.player.club ?? '')} · Illustrative pick</small></div></div><div class="kpi-foot"><span class="up-tag">${(topCaptain?.projection ?? 0).toFixed(1)} xPts</span> Expected this GW</div></div>
    <div class="kpi-card"><div class="kpi-head"><span>Model coverage</span><span class="kpi-icon kpi-icon-amber">◈</span></div><div class="kpi-value">${demoPlayers.length}<small> demo players</small></div><div class="kpi-foot">Independent baseline engine</div><div class="progress-track"><span style="width:62%"></span></div></div></div>
    <div class="dashboard-bottom"><section class="panel dashboard-leaders"><div class="panel-head"><div><h3>Players on the radar</h3><p>Best illustrative ${state.horizon}-GW point forecasts</p></div><a href="#/players" class="text-link">View all players ↗</a></div><div class="table-scroll"><table class="data-table"><thead><tr><th>#</th><th>PLAYER</th><th>PRICE</th><th>OWNED</th><th>NEXT 3</th><th>STATUS</th><th>START%</th><th>STARTS</th><th>SUB ON</th><th>SUB OFF</th><th>AVG MIN</th><th>90s</th><th>xMINS</th><th>${state.horizon}GW xPTS</th><th></th></tr></thead><tbody>${highest.map((player,index)=>playerRow(player,index+1)).join('')}</tbody></table></div></section>
    <section class="panel insight-panel"><div class="panel-head"><div><h3>Fixture intelligence</h3><p>The next five gameweeks</p></div><a href="#/fixtures" class="text-link">Full matrix ↗</a></div><div class="fixture-mini">${['MCI','ARS','CHE','LIV','AVL'].map(club=>{const player=demoPlayers.find(p=>p.club===club);return `<div class="fixture-mini-row"><span class="club-icon" style="--club:${teamColors[club]}">${club.slice(0,1)}</span><span class="mini-team">${club}</span><div class="fixture-mini-cells">${(player?.fixtures ?? [3,3,3,3,3]).slice(0,5).map((level,index)=>badgeFdr(level, String(index+7))).join('')}</div></div>`;}).join('')}</div><div class="insight-note"><span>✦</span><div><strong>Read the schedule, not just the form.</strong><p>Use the matrix to weigh short-term opportunities against longer-term risk.</p></div></div></section></div>`;
}
function filteredPlayers(): Player[] {
  const matching = demoPlayers.filter(player => (state.position === 'ALL' || state.position === player.position) && `${player.name} ${player.club}`.toLowerCase().includes(state.search.toLowerCase().trim()));
  return [...matching].sort((first, second) => state.sort === 'price' ? second.price-first.price : state.sort === 'ownership' ? second.ownership-first.ownership : currentHorizonPoints(second)-currentHorizonPoints(first));
}
function playersPage(): string {
  const filtered=filteredPlayers();
  return `${header('Player <span class="title-accent">Intelligence.</span>', 'Explore the numbers behind every decision.', 'ANALYTICS / PLAYER INTELLIGENCE', '<button id="csv-export" class="button button-outline">↓ Export CSV</button>')}
    ${globalFilters()}
    <section class="panel players-panel"><div class="panel-head table-header"><div><h3>Player database <span class="count-pill">${filtered.length}</span></h3><p>Starts, sub-on/sub-off, actual minutes and independently computed illustrative projections</p></div><div class="table-tools"><label class="search-input"><span>⌕</span><input id="player-search" type="search" value="${escapeHtml(state.search)}" placeholder="Search name or club" aria-label="Search players" /></label><select id="position-filter" class="small-select" aria-label="Filter by position">${['ALL','GKP','DEF','MID','FWD'].map(position=>`<option ${state.position===position?'selected':''} value="${position}">${position==='ALL'?'All positions':position}</option>`).join('')}</select><select id="sort-filter" class="small-select" aria-label="Sort players"><option value="forecast" ${state.sort==='forecast'?'selected':''}>Forecast</option><option value="price" ${state.sort==='price'?'selected':''}>Price</option><option value="ownership" ${state.sort==='ownership'?'selected':''}>Ownership</option></select></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>#</th><th>PLAYER</th><th>PRICE</th><th>OWNED</th><th>NEXT 3</th><th>STATUS</th><th>START%</th><th>STARTS</th><th>SUB ON</th><th>SUB OFF</th><th>AVG MIN</th><th>90s</th><th>xMINS</th><th>${state.horizon}GW xPTS</th><th></th></tr></thead><tbody>${filtered.map((player,index)=>playerRow(player,index+1)).join('')}</tbody></table></div>${filtered.length===0?'<div class="empty-state">No players match these filters. Try a different search.</div>':''}</section><div class="disclaimer-strip">ⓘ Starts, substitutions, minutes and 90s remain blank until a verified appearance dataset is supplied. Five sourced portraits from Wikimedia Commons (CC BY-SA or CC0) — see docs/photo-credits.md for credits and licenses. Expected points are generated from demonstrative inputs, not the live FPL season. Production forecasts need verified feeds and backtesting.</div>`;
}
function fixtureText(club:string,index:number,level:number):string {
  const fixture = sampleFixtures[club]?.[index % 5] ?? 'TBC H';
  const [opponent,venue]=fixture.split(' ');
  return `${opponent ?? 'TBC'} [${venue ?? 'H'}] - ${level}`;
}
function fixturesPage(): string {
  const clubs=['MCI','ARS','LIV','CHE','AVL','MUN','NEW','BHA','TOT','EVE'];
  const index=state.fixtureSortGw-7;
  const firstIndex=state.gw-7;
  const visibleWeeks=17-state.gw;
  const ordered=[...clubs].sort((first,second)=>{
    const af=demoPlayers.find(player=>player.club===first)?.fixtures[index] ?? 5;
    const bf=demoPlayers.find(player=>player.club===second)?.fixtures[index] ?? 5;
    return af-bf || first.localeCompare(second);
  });
  return `${header('Fixture <span class="title-accent">Matrix.</span>', 'Pick a gameweek to sort easiest opponents first.', 'SCOUTING / FIXTURE MATRIX')}
    ${globalFilters()}<div class="section-top"><div><h2>Fixture difficulty radar</h2><p>Click any GW column to rank teams by fixture difficulty (1 easiest, 5 hardest)</p></div><div class="fdr-legend"><span>${badgeFdr(1)} Very easy</span><span>${badgeFdr(2)} Easy</span><span>${badgeFdr(3)} Neutral</span><span>${badgeFdr(4)} Hard</span><span>${badgeFdr(5)} Very hard</span></div></div>
    <section id="public-league-matrix" class="panel fixture-panel source-fixture-panel" aria-live="polite"><div class="panel-head"><div><h3>Independent FDR · Public-domain league schedule</h3><p>Community fixture feed + independently calculated xG and clean-sheet odds. Click a GW tab to sort easiest first.</p></div><span class="tag tag-neutral">LOADING PUBLIC DATA</span></div><p class="source-state">Checking source snapshot…</p></section>
    <div id="illustrative-fixtures"><section class="panel fixture-panel"><div class="table-scroll"><table class="fixture-table premium-fixtures"><thead><tr><th>CLUB</th><th>AVG FDR</th>${Array.from({length:visibleWeeks},(_,i)=>`<th><button type="button" class="gw-sort ${state.fixtureSortGw===state.gw+i?'active':''}" data-gw-sort="${state.gw+i}" aria-pressed="${state.fixtureSortGw===state.gw+i}">GW ${state.gw+i} ↕</button></th>`).join('')}</tr></thead><tbody>${ordered.map(club=>{const player=demoPlayers.find(candidate=>candidate.club===club);const levels=player?.fixtures.slice(firstIndex,firstIndex+visibleWeeks) ?? [];const avg=levels.reduce((sum,level)=>sum+level,0)/(levels.length||1);return `<tr><td><div class="team-cell"><span class="club-icon" style="--club:${teamColors[club]}">${club[0]}</span><div><strong>${club}</strong><small>${escapeHtml(clubNames[club]??'')}</small></div></div></td><td class="tabular"><strong>${avg.toFixed(1)}</strong></td>${levels.map((level,i)=>`<td class="${state.fixtureSortGw===state.gw+i?'selected-gw':''}">${badgeFdr(level,fixtureText(club,firstIndex+i,level))}</td>`).join('')}</tr>`}).join('')}</tbody></table></div></section></div><div class="disclaimer-strip">ⓘ Source: OpenFootball (public domain, community-maintained; updates can be delayed). FDR, xG and CS% are calculated independently—not official FPL difficulty ratings or verified player forecasts. If source data is unavailable, an explicitly illustrative matrix is shown.</div>`;
}
function attackingPage():string {
  const stats=demoPlayers.map(player=>({player,forecast:advancedForecast(player,Math.min(state.gw-6,10))}));
  stats.sort((a,b)=>(state.goalSort==='assists'?b.forecast.expectedAssists-a.forecast.expectedAssists:state.goalSort==='total'?(b.forecast.expectedGoals+b.forecast.expectedAssists)-(a.forecast.expectedGoals+a.forecast.expectedAssists):b.forecast.expectedGoals-a.forecast.expectedGoals));
  return `${header('Attacking <span class="title-accent">Projections.</span>','Expected goals and expected assists modeled separately.','SCOUTING / ATTACKING DATA')}${globalFilters()}<section class="panel players-panel"><div class="panel-head"><div><h3>xG and xA by player</h3><p>Opponent-adjusted expected contributions for one illustrative fixture</p></div><div class="tab-switch" role="group" aria-label="Rank attacking projections">${[['goals','Sort xG'],['assists','Sort xA'],['total','Sort xG+xA']].map(([key,label])=>`<button type="button" data-goal-sort="${key}" class="${state.goalSort===key?'selected':''}">${label}</button>`).join('')}</div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>PLAYER</th><th>OPP FDR</th><th>xG</th><th>xA</th><th>CS%</th><th>START%</th><th>xMINS</th><th>xPTS</th></tr></thead><tbody>${stats.map(({player,forecast})=>`<tr><td><div class="player-identity">${portrait(player)}<div><strong>${escapeHtml(player.name)}</strong><small>${player.club} · ${player.position}</small></div></div></td><td>${badgeFdr(player.fixtures[state.gw-7]??3)}</td><td class="tabular emphasis">${forecast.expectedGoals.toFixed(2)}</td><td class="tabular">${forecast.expectedAssists.toFixed(2)}</td><td class="tabular">${(forecast.cleanSheetProbability*100).toFixed(1)}%</td><td class="tabular">${(forecast.startProbability*100).toFixed(0)}%</td><td class="tabular">${forecast.expectedMinutes.toFixed(0)}′</td><td class="tabular emphasis">${forecast.expectedPoints.toFixed(1)}</td></tr>`).join('')}</tbody></table></div></section><div class="disclaimer-strip">ⓘ Independent shrinkage-based calculations on synthetic rates. These xG and xA values are not trained, calibrated or validated forecasts.</div>`;
}
function cleanSheetPage():string {
  const rows=demoPlayers.filter(player=>player.position==='GKP'||player.position==='DEF'||player.position==='MID').map(player=>({player,forecast:advancedForecast(player,Math.min(state.gw-6,10))})).sort((a,b)=>b.forecast.cleanSheetProbability-a.forecast.cleanSheetProbability);
  return `${header('Clean Sheet <span class="title-accent">Lab.</span>','Clear CS%, minutes and starting probability for every player.','SCOUTING / DEFENSIVE INTELLIGENCE')}${globalFilters()}<section class="panel players-panel"><div class="panel-head"><div><h3>Projected defensive returns</h3><p>Independent Poisson-style opponent adjustment · Illustrative only</p></div><span class="tag tag-neutral">UNCALIBRATED</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>PLAYER</th><th>FDR</th><th>CS%</th><th>START%</th><th>APPEAR%</th><th>xMINS</th><th>xPTS</th></tr></thead><tbody>${rows.map(({player,forecast})=>`<tr><td><div class="player-identity">${portrait(player)}<div><strong>${escapeHtml(player.name)}</strong><small>${player.club} · ${player.position}</small></div></div></td><td>${badgeFdr(player.fixtures[state.gw-7]??3)}</td><td class="emphasis">${(forecast.cleanSheetProbability*100).toFixed(1)}%</td><td>${(forecast.startProbability*100).toFixed(0)}%</td><td>${(forecast.appearanceProbability*100).toFixed(0)}%</td><td>${forecast.expectedMinutes.toFixed(0)}′</td><td class="emphasis">${forecast.expectedPoints.toFixed(1)}</td></tr>`).join('')}</tbody></table></div></section><div class="disclaimer-strip">ⓘ CS% here is a research proxy, not verified outcome probabilities. Official FPL points for a clean sheet depend on position and actual minutes.</div>`;
}
function solverPage():string {
  const available=17-state.gw;
  return `${header('Deep <span class="title-accent">Solver.</span>','Explore ten gameweeks of transfers and chip strategies using our own search engine.','PLANNING / VORTEX SOLVER')}${globalFilters()}<div class="panel deep-solver-panel"><div class="panel-head"><div><h3>10-gameweek strategy explorer</h3><p>Budget · position · 3-per-club · max 5 saved free transfers · chip usage · captaincy</p></div><span class="tag tag-neutral">BOUNDED SEARCH</span></div><div class="solver-controls"><label>Planning horizon <select id="solver-weeks">${[3,5,6,8,10,available].filter((n,index,arr)=>n<=available&&arr.indexOf(n)===index).sort((a,b)=>a-b).map(n=>`<option ${n===available?'selected':''} value="${n}">${n} gameweeks</option>`).join('')}</select></label><button class="button button-primary" type="button" id="run-deep-solver">Calculate transfer + chip route ↗</button></div><div class="disclaimer-strip">ⓘ Heuristic beam search. WC/FH test a limited number of roster alternatives (not every legal combination). This is not a guaranteed global optimum or a live 2026/27 recommendation.</div><div id="deep-plan" role="status" aria-live="polite">${solvedPlan?displayDeepPlan(solvedPlan):'<p class="solver-initial">Run the solver to generate a visible, week-by-week decision plan. No imaginary live recommendations will be shown.</p>'}</div></div>`;
}
function displayDeepPlan(plan:DeepPlan):string {
  return `<div class="solver-stats"><div><span>Candidate plans explored</span><strong>${plan.explored}</strong></div><div><span>Projected total (demo)</span><strong>${plan.expectedTotal.toFixed(1)}</strong></div><div><span>Vs hold-only baseline</span><strong>${plan.gain>=0?'+':''}${plan.gain.toFixed(1)}</strong></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>GW</th><th>CHIP</th><th>TRANSFERS</th><th>CAPTAIN</th><th>FREE TRANSFERS NEXT</th><th>SIMULATED POINTS</th></tr></thead><tbody>${plan.stages.map(step=>`<tr><td><strong>GW${step.gameweek}</strong></td><td><span class="chip-pill">${step.chip==='none'?'—':escapeHtml(step.chip)}</span></td><td>${step.transfers.length?step.transfers.map(move=>`${escapeHtml(byId.get(move.out)?.name??'?')} → ${escapeHtml(byId.get(move.in)?.name??'?')}`).join('<br>'):'Save FT'}</td><td>${escapeHtml(byId.get(step.captainId)?.name??'—')}</td><td>${step.freeTransfersNext}</td><td class="emphasis">${step.points.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>`;
}
function chasePage():string {
  const advice=cachedRankAdvice();
  const profile=rankProfile;
  const first=advice.first;
  const playerName=(id:number)=>escapeHtml(byId.get(id)?.name??'Unknown player');
  const firstTransfers=first.transfers.length?first.transfers.map(t=>`${playerName(t.out)} → ${playerName(t.in)}`).join('<br>'):'No transfer; save FT';
  const gap=advice.rankGap===null?'Not supplied':advice.rankGap===0?'Inside target today':`${advice.rankGap.toLocaleString()} places outside target`;
  return `${header('Road to <span class="title-accent">top 5,000.</span>','Your weekly decision desk for pursuing a top-5K overall finish by GW19.','VORTEX / RANK CHASE','<a class="button button-primary" href="#/squad">Edit squad ↗</a>')}
    ${globalFilters()}
    <section class="chase-hero" aria-label="Rank target summary">
      <div><span class="chase-kicker">OVERALL RANK TARGET</span><strong>Top ${TARGET_RANK.toLocaleString()}</strong><small>By the end of GW${TARGET_GW}</small></div>
      <div><span class="chase-kicker">GAMEWEEKS LEFT</span><strong>${advice.remainingToTarget}</strong><small>Including GW${state.gw}</small></div>
      <div><span class="chase-kicker">YOUR RANK GAP</span><strong class="chase-gap">${gap}</strong><small>${liveRankStatus==='verified'?'Fetched from FPL website':profile.overallRank===null?'No rank synced yet':'Entered manually; not verified live'}</small></div>
      <div><span class="chase-kicker">CURRENT PLAN COVERAGE</span><strong>Through GW${advice.planningUntilGW}</strong><small>Forecasts after GW16 not yet available</small></div>
    </section>
    <section class="chase-grid">
      <article class="panel chase-config"><div class="panel-head"><div><h3>Manager profile & target</h3><p>Fetch public FPL entry data on demand. This does not import model-ready player projections or authorize bulk use.</p></div><span class="tag tag-neutral">ON-DEMAND FPL SYNC</span></div>
        <div class="chase-form">
          <label>FPL entry ID <input id="chase-entry" type="number" min="1" step="1" placeholder="Enter your FPL team ID" value="${profile.entryId??''}" /></label>
          <label>Current overall rank <input id="chase-rank" type="number" min="1" step="1" placeholder="e.g. 75,000" value="${profile.overallRank??''}" /></label>
          <label>Current total FPL points <input id="chase-points" type="number" min="0" step="1" placeholder="From your FPL account" value="${profile.overallPoints??''}" /></label>
          <label>Hypothetical points total at GW19 <input id="chase-benchmark" type="number" min="0" step="1" placeholder="Optional · no verified rank benchmark" value="${profile.hypotheticalGw19Points??''}" /></label>
          <label>Decision filter <select id="chase-risk"><option value="conservative" ${profile.risk==='conservative'?'selected':''}>Conservative — require clearer edge</option><option value="balanced" ${profile.risk==='balanced'?'selected':''}>Balanced — default</option><option value="aggressive" ${profile.risk==='aggressive'?'selected':''}>Aggressive — review smaller edges</option></select></label>
        </div>
        <fieldset class="chase-chips"><legend>Chips still available — select only those you own</legend>${AVAILABLE_CHIPS.map(chip=>`<label><input type="checkbox" name="chase-chip" value="${chip}" ${profile.availableChips.includes(chip)?'checked':''}/> ${chip==='triplecaptain'?'Triple Captain':chip==='benchboost'?'Bench Boost':chip==='freehit'?'Free Hit':'Wildcard'}</label>`).join('')}</fieldset>
        <div class="chase-sync-controls"><button class="button button-primary" id="chase-sync-live" type="button">↻ Sync live FPL rank</button><button class="button button-outline" id="chase-save" type="button">Save profile & roadmap ↗</button></div>
        <p id="chase-live-status" class="chase-assumption" role="status" aria-live="polite">${escapeHtml(liveRankDetail)}</p>
        ${advice.hypotheticalPointsPerWeek===null?'<p class="chase-assumption">A points-per-week target cannot be estimated from rank alone. A points benchmark must be explicitly supplied; no top-5K points cutoff is invented.</p>':`<p class="chase-assumption"><strong>${advice.hypotheticalPointsPerWeek.toFixed(1)} points/GW</strong> would reach your <em>hypothetical</em> points total, assuming ${profile.overallPoints} verified current points. This does not predict your finishing rank.</p>`}
      </article>
      <article class="panel chase-next"><div class="panel-head"><div><h3>Next decision · GW${first.gameweek}</h3><p>Automatic bounded-search output based on the currently selected <strong>DEMO squad</strong>, not your imported FPL team.</p></div><span class="tag tag-neutral">RESEARCH ONLY</span></div>
        <span class="chase-action">${advice.action}</span>
        <div class="chase-headline">${first.chip!=='none'?`Evaluate ${escapeHtml(first.chip)}`:firstTransfers}</div>
        <p>${escapeHtml(advice.description)}</p>
        <div class="chase-brief"><div><span>Captain candidate</span><strong>${playerName(first.captainId)}</strong></div><div><span>Expected points</span><strong>${first.points.toFixed(1)} <small>demo</small></strong></div><div><span>Next free transfers</span><strong>${first.freeTransfersNext}</strong></div><div><span>Simulated plan edge</span><strong>${advice.plan.gain>=0?'+':''}${advice.plan.gain.toFixed(1)} <small>over hold only</small></strong></div></div>
        <p class="chase-assumption">This is a what-if search result, NOT an instruction to execute the transfer or play a chip. Check real squad, live minutes, suspensions, available chips and selling prices.</p>
      </article>
    </section>
    ${liveEntrySquad?.picks?.players?.length===15 ? `<section class="panel chase-live-squad"><div class="panel-head"><div><h3>Your FPL squad · GW${liveEntrySquad.picks.gameweek}</h3><p>Actual publicly returned team selections · ${escapeHtml(liveEntrySquad.fetchedAt)} · independent of simulated solver picks</p></div><span class="tag tag-green">SOURCE: FPL</span></div>
      <div class="chase-live-meta"><span>Last-deadline bank <strong>${liveEntrySquad.bankInTenths===null?'Not reported':`£${(liveEntrySquad.bankInTenths/10).toFixed(1)}m`}</strong></span><span>Team value <strong>${liveEntrySquad.teamValueInTenths===null?'Not reported':`£${(liveEntrySquad.teamValueInTenths/10).toFixed(1)}m`}</strong></span><span>Chips reported as used <strong>${escapeHtml(liveEntrySquad.chipsPlayed.length?liveEntrySquad.chipsPlayed.map(c=>`${c.name} GW${c.gameweek}`).join(' · '):'None reported')}</strong></span></div>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>PLAYER</th><th>TEAM</th><th>POS</th><th>FPL PRICE</th><th>SELECTION</th><th>STATUS</th></tr></thead><tbody>${liveEntrySquad.picks.players.map(p=>`<tr><td><strong>${escapeHtml(p.name??`Player ID ${p.id}`)}</strong></td><td>${escapeHtml(p.club??'—')}</td><td>${escapeHtml(p.positionName??'—')}</td><td>${p.priceTenths===null?'—':`£${(p.priceTenths/10).toFixed(1)}m`}</td><td>${p.isCaptain?'Captain':p.isViceCaptain?'Vice captain':p.multiplier===0?'Bench':'Starter'}</td><td>${escapeHtml(p.officialStatus??'Not reported')}</td></tr>`).join('')}</tbody></table></div><p class="chase-assumption">FPL roster data are real source values. Forecasts and transfer routes elsewhere remain model demonstrations and are NOT calculated from these official player IDs.</p></section>` : ''}
    <section class="panel chase-roadmap"><div class="panel-head"><div><h3>Automatic weekly roadmap — GW${state.gw} to GW${advice.planningUntilGW}</h3><p>Recalculate after every deadline. The full goal remains GW19; forecasts GW17–19 are not yet available.</p></div><a class="button button-outline" href="#/solver">Full Deep Solver ↗</a></div>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>GW</th><th>SCENARIO</th><th>TRANSFER / HOLD</th><th>CAPTAIN</th><th>FREE TRANSFERS</th><th>DEMO xPTS</th></tr></thead><tbody>${advice.plan.stages.map(stage=>`<tr><td><strong>GW${stage.gameweek}</strong></td><td>${stage.chip==='none'?'Normal':`<span class="chip-pill">${escapeHtml(stage.chip)}</span>`}</td><td>${stage.transfers.length?stage.transfers.map(t=>`${playerName(t.out)} → ${playerName(t.in)}`).join('<br>'):'Save transfer'}</td><td>${playerName(stage.captainId)}</td><td class="tabular">${stage.freeTransfersNext}</td><td class="tabular emphasis">${stage.points.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>
    </section>
    <section class="chase-notes" aria-label="Data integrity notes">${advice.warnings.map(w=>`<p>ⓘ ${escapeHtml(w)}</p>`).join('')}</section>`;
}
function squadPage(): string {
  const squadPlayers=state.squad.selectedIds.map(id=>byId.get(id)).filter((player):player is Player=>Boolean(player));
  const groups:Position[]=['GKP','DEF','MID','FWD'];
  const totalCost=squadPlayers.reduce((total,player)=>total+player.price,0);
  const totalPts=squadPlayers.reduce((total,player)=>total+currentHorizonPoints(player),0);
  return `${header('Squad <span class="title-accent">Forge.</span>', 'Make every place, pound and gameweek count.', 'PLANNING / SQUAD FORGE', '<button id="reset-squad" class="button button-outline">↺ Reset demo squad</button>')}
    ${globalFilters()}<div class="squad-layout"><div class="panel pitch-panel"><div class="panel-head"><div><h3>Squad formation</h3><p>15 players · 2 GK / 5 DEF / 5 MID / 3 FWD</p></div><span class="tag tag-green">DEMO SQUAD</span></div><div class="pitch-field"><span class="pitch-middle"></span><span class="pitch-center"></span>${groups.map(position=>`<div class="pitch-line line-${position.toLowerCase()}">${squadPlayers.filter(player=>player.position===position).map(player=>`<button class="pitch-player captain-toggle" data-id="${player.id}" title="Make ${escapeHtml(player.name)} captain">${portrait(player,'medium')}<span class="pitch-name">${escapeHtml(player.name.split(' ').slice(-1)[0]??player.name)}${player.id===state.squad.captainId?'<b class="captain-mark">C</b>':''}</span><small>${currentHorizonPoints(player).toFixed(1)} xPts</small></button>`).join('')}</div>`).join('')}</div><div class="pitch-caption">Select a player to set captain. Plan data is stored locally in this browser.</div></div><aside class="squad-right"><div class="panel squad-summary"><div class="panel-head"><h3>Your squad snapshot</h3></div><div class="summary-grid"><div><span>Squad value</span><strong>£${totalCost.toFixed(1)}m</strong></div><div><span>Cash in bank</span><strong>£${state.squad.bank.toFixed(1)}m</strong></div><div><span>${state.horizon}-week total EV</span><strong>${totalPts.toFixed(1)}</strong></div><div><span>Free transfers</span><strong>${state.squad.freeTransfers}</strong></div></div><div class="squad-form"><label>Bank (£m)<input id="bank-input" type="number" min="0" max="30" step="0.1" value="${state.squad.bank}" /></label><label>Free transfers<select id="ft-input">${[0,1,2,3,4,5].map(value=>`<option value="${value}" ${state.squad.freeTransfers===value?'selected':''}>${value}</option>`).join('')}</select></label></div><button class="button button-primary block" id="save-squad">Save squad settings ↗</button></div><div class="panel chase-swap"><h3>Modify demonstration squad</h3><p>Replace a model player with a same-position option. Prices are illustrative; this is NOT your live FPL roster.</p><label>Player out<select id="swap-out-player">${squadPlayers.map(p=>`<option value="${p.id}">${escapeHtml(p.name)} · ${p.position}</option>`).join('')}</select></label><label>Player in<select id="swap-in-player">${demoPlayers.filter(p=>!state.squad.selectedIds.includes(p.id)).map(p=>`<option value="${p.id}">${escapeHtml(p.name)} · ${p.position} · £${p.price.toFixed(1)}</option>`).join('')}</select></label><button type="button" class="button button-outline block" id="swap-squad-player">Swap player ↗</button><a href="#/chase" class="button button-primary block">Go to Top 5K Adviser ↗</a></div><div class="panel squad-tip"><span class="tip-icon">✦</span><h3>A smarter squad starts here.</h3><p>Run your single-transfer opportunities against squad budget and club limits.</p><a href="#/strategy" class="button button-outline block">Open Strategy Engine ↗</a></div></aside></div>`;
}
function strategyPage(): string {
  const recommendations=optimizeOneTransfer(demoPlayers,state.squad,state.horizon);
  const valid=recommendations.filter(item=>item.netGain>0);
  return `${header('Strategy <span class="title-accent">Engine.</span>', 'Turn the data into a clearer next move.', 'OPTIMIZATION / STRATEGY ENGINE')}
    ${globalFilters()}<div class="strategy-layout"><section class="panel"><div class="panel-head"><div><h3>Single-transfer simulator</h3><p>Budget-safe, position-matched ideas across ${state.horizon} gameweeks</p></div><span class="tag tag-green">DETERMINISTIC DEMO</span></div><div class="optimizer-summary"><div><small>Suggestions evaluated</small><strong>${recommendations.length}</strong></div><div><small>Positive net opportunities</small><strong>${valid.length}</strong></div><div><small>Available bank</small><strong>£${state.squad.bank.toFixed(1)}m</strong></div><div><small>Transfer hit</small><strong>-${state.squad.freeTransfers>0?0:4} pts</strong></div></div><div class="recommendation-list">${recommendations.length ? recommendations.map((item,index)=>`<div class="recommendation"><span class="rec-index">${String(index+1).padStart(2,'0')}</span><div class="rec-player">${portrait(item.outgoing)}<div><strong>${escapeHtml(item.outgoing.name)}</strong><small>OUT · ${escapeHtml(item.outgoing.club)}</small></div></div><span class="rec-arrow">→</span><div class="rec-player">${portrait(item.incoming)}<div><strong>${escapeHtml(item.incoming.name)}</strong><small>IN · ${escapeHtml(item.incoming.club)}</small></div></div><span class="rec-gain ${item.netGain>0?'positive':'negative'}">${item.netGain>0?'+':''}${item.netGain.toFixed(1)} <small>net xPts</small></span></div>`).join(''):'<div class="empty-state">No affordable, valid moves for this squad.</div>'}</div></section><aside class="strategy-side"><div class="panel strategy-explain"><span class="strategy-symbol">◇</span><h3>How this ranks moves</h3><p>Each scenario replaces one player with another at the same position, checks your bank and maximum three players per club, and subtracts the transfer hit.</p><div class="rule"><span>01</span><div>Squad formation preserved</div><span>✓</span></div><div class="rule"><span>02</span><div>Budget and club restrictions</div><span>✓</span></div><div class="rule"><span>03</span><div>Horizon-weighted forecast</div><span>✓</span></div><div class="rule"><span>04</span><div>Full-chip / multi-GW optimizer</div><span class="coming">LATER</span></div></div></aside></div><div class="disclaimer-strip">ⓘ This is a working, constrained single-transfer demo optimizer, not FPLReview's proprietary transfer solver.</div>`;
}
function modelPage(): string {
  const ranked=[...demoPlayers].sort((a,b)=>currentHorizonPoints(b)-currentHorizonPoints(a)).slice(0,6);
  return `${header('Model <span class="title-accent">Lab.</span>', 'Understand the reasoning behind every projection.', 'RESEARCH / MODEL LAB')}
    ${globalFilters()}<div class="model-grid"><div class="panel model-main"><div class="panel-head"><div><h3>Forecast decomposition</h3><p>Expected contribution across scoring categories · next gameweek</p></div><span class="tag tag-neutral">BASELINE v0.1</span></div><div class="model-bars">${ranked.map(player=>{const p=advancedForecast(player,state.gw-6);const total=p.expectedPoints||1;return `<div class="model-row"><div class="model-row-name">${portrait(player)}<span>${escapeHtml(player.name)}</span></div><div class="stacked-bar"><span style="width:${p.components.appearance/total*100}%;background:#9cd8c4"></span><span style="width:${(p.components.goals+p.components.assists)/total*100}%;background:#056b52"></span><span style="width:${p.components.cleanSheet/total*100}%;background:#5b91e6"></span><span style="width:${p.components.bonusProxy/total*100}%;background:#e6c179"></span></div><strong>${p.expectedPoints.toFixed(1)}</strong></div>`}).join('')}</div><div class="chart-legend"><span><i style="background:#9cd8c4"></i> Appearance</span><span><i style="background:#056b52"></i> Attack</span><span><i style="background:#5b91e6"></i> Clean sheet</span><span><i style="background:#e6c179"></i> Bonus</span></div></div><div class="panel model-side"><span class="strategy-symbol">◈</span><h3>Built on evidence. Improved by iteration.</h3><p>The demo baseline combines expected minutes, attacking rates, role-specific scoring and opponent difficulty. It does not claim machine-learning accuracy.</p><div class="model-metrics"><div><span>Player samples</span><strong>${demoPlayers.length}</strong></div><div><span>Fixture horizon</span><strong>10 synthetic GWs</strong></div><div><span>Trained model</span><strong>Pending</strong></div><div><span>Validated accuracy</span><strong>Not yet</strong></div></div></div></div><section class="panel simulation-panel"><div class="panel-head"><div><h3>Uncertainty explorer</h3><p>2,000 seeded simulations · intentionally uncalibrated demonstration</p></div><span class="tag tag-neutral">DEMO · MONTE CARLO</span></div>
    <div class="simulation-controls"><label class="select-wrapper"><span>Player</span><select id="simulation-player" aria-label="Simulation player">${demoPlayers.slice(0,16).map(player=>`<option value="${player.id}">${escapeHtml(player.name)}</option>`).join('')}</select></label>
    <label class="select-wrapper"><span>Fixture</span><select id="simulation-gw" aria-label="Simulation gameweek">${Array.from({length:10},(_,index)=>`<option value="${index}">GW ${7+index}</option>`).join('')}</select></label>
    <button id="run-simulation" class="button button-primary" type="button">Run simulation ↗</button></div>
    <div id="simulation-result" class="simulation-result" aria-live="polite" role="status">Choose a player and run the simulation to see expected points, P10/P50/P90 and scoring probabilities.</div>
    <div class="disclaimer-strip">ⓘ This simulates illustrative goals, assists, appearances and clean sheets. It is not a calibrated model or live recommendation.</div></section>
    <section class="panel model-roadmap"><div class="panel-head"><div><h3>Research roadmap</h3><p>How the independent Vortex forecast engine will mature</p></div></div><div class="roadmap-steps"><div><span>01</span><strong>Data lineage</strong><p>Licensed events, lineups, minutes and fixture history.</p></div><div><span>02</span><strong>Probabilistic models</strong><p>Appearance, xG, assists and clean-sheet distributions.</p></div><div><span>03</span><strong>Walk-forward validation</strong><p>Backtest against held-out gameweeks with calibration.</p></div><div><span>04</span><strong>Optimization</strong><p>Multi-week planning under realistic constraints.</p></div></div></section>`;
}
function dataPage(): string {
  return `${header('Data <span class="title-accent">Studio.</span>', 'Transparent sources. Reproducible research. No invented freshness.', 'RESEARCH / DATA STUDIO')}
    <div class="data-studio-grid"><section class="panel source-panel"><div class="panel-head"><div><h3>Source integrity</h3><p>Authorized data can be imported without scraping public websites.</p></div><span class="tag tag-neutral">PROVENANCE FIRST</span></div>
    <div id="data-studio-status" class="source-state" role="status" aria-live="polite"><span class="source-pulse"></span> Checking local data service…</div>
    <div class="rule"><span>01</span><div>Supplier and usage rights are recorded for every imported snapshot.</div><span>✓</span></div>
    <div class="rule"><span>02</span><div>SHA-256 integrity checks detect modified snapshot files.</div><span>✓</span></div>
    <div class="rule"><span>03</span><div>Outdated data is labeled — never presented as real-time.</div><span>✓</span></div>
    <button id="refresh-source" class="button button-outline" type="button">Refresh data status ↻</button></section>
    <section class="panel strategy-explain"><span class="strategy-symbol">◇</span><h3>Model maturity</h3><p>Player projections on the public dashboard remain illustrative until the independent model is trained, evaluated, and approved for publishing.</p>
    <div class="model-metrics"><div><span>Raw data ingestion</span><strong>Ready</strong></div><div><span>API contract</span><strong>v1</strong></div><div><span>Calibrated predictive model</span><strong>Pending</strong></div><div><span>Rights-cleared photographs</span><strong>Pending</strong></div></div></section></div>
    <section class="panel week-audit"><div class="panel-head"><div><h3>Historical reality check · GW1–GW6</h3><p>Before each kickoff: archived prediction. After the final score: actual points. No hindsight fitting.</p></div><button type="button" id="run-week-audit" class="button button-outline">Inspect GW1–GW6 ↗</button></div><div id="week-audit" class="audit-gw-grid" aria-live="polite">${Array.from({length:6},(_,i)=>`<div class="audit-gw"><strong>GW ${i+1}</strong><small>No verified comparison yet</small></div>`).join('')}</div><p class="audit-caution">Accuracy is measured by error (MAE/RMSE) and calibrated start probability. A single unqualified “% accurate” would be misleading. GW6 completed Oct 12; GW7 began Oct 17, 2026.</p></section>
    <section class="panel week-audit public-research-audit"><div class="panel-head"><div><h3>League results · GW1–GW6 reality check</h3><p>Independent retrospective team-goals model, compared to community-reported full-time scores. Missing scores are excluded.</p></div><button type="button" id="public-league-audit-refresh" class="button button-outline">Refresh research ↻</button></div><div id="public-league-audit" class="audit-gw-grid" aria-live="polite">Loading public-domain team results…</div><p class="audit-caution">These are team goal errors and CS probability scores—not player FPL-points accuracy. Replayed today using earlier-GW data, not independently archived pre-match forecasts.</p></section>
    <div class="disclaimer-strip">ⓘ Two distinct data sources: public-domain match fixtures/scores and separately authorized player statistics. OpenFootball is community-maintained and may omit finished results. Neither constitutes proprietary FPLReview or Opta data.</div>`;
}
function pricesPage():string {
  const ranked=[...demoPlayers].sort((a,b)=>b.ownership-a.ownership);
  return `${header('Price <span class="title-accent">Pulse.</span>', 'Player price rises and falls with an honest confidence indicator.', 'MARKET / PRICE PULSE')}${globalFilters()}<section class="panel players-panel"><div class="panel-head"><div><h3>Price movement tracker</h3><p>Experimental time estimation requires at least 48 hours of authorized transfer and price snapshots</p></div><div class="tab-switch" role="group" aria-label="Price movement direction"><button type="button" data-price-direction="rise" class="${state.priceDirection==='rise'?'selected':''}">↗ Price increases</button><button type="button" data-price-direction="fall" class="${state.priceDirection==='fall'?'selected':''}">↘ Price decreases</button></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>PLAYER</th><th>PRICE</th><th>OWNERSHIP</th><th>DIRECTION</th><th>ESTIMATED TIME</th><th>CONFIDENCE</th></tr></thead><tbody>${ranked.slice(state.priceDirection==='rise'?0:12,state.priceDirection==='rise'?12:24).map(player=>`<tr><td><div class="player-identity">${portrait(player)}<div><strong>${escapeHtml(player.name)}</strong><small>${player.club}</small></div></div></td><td class="emphasis">£${player.price.toFixed(1)}m</td><td>${player.ownership.toFixed(1)}%</td><td>${state.priceDirection==='rise'?'Potential rise':'Potential fall'} · unverified</td><td><strong>Not available</strong><small class="cell-note">Needs verified price history</small></td><td><span class="tag tag-neutral">NO VERIFIED SIGNAL</span></td></tr>`).join('')}</tbody></table></div></section><div class="disclaimer-strip">ⓘ Player prices and ownership here are sample values. FPL does not publish its proprietary price thresholds, so a precise rise/fall ETA cannot be honestly inferred without calibrated historical observations.</div>`;
}
function reviewPage():string {
  return `${header('Performance <span class="title-accent">Journal.</span>', 'Where decisions become better decisions.', 'RESEARCH / PERFORMANCE JOURNAL')}<div class="review-empty"><div class="review-icon">◎</div><h2>Every great season leaves a trail.</h2><p>Once historical results and your FPL team are connected, this space will track forecast accuracy, manager decisions, captaincy outcomes and your long-term progress.</p><div class="review-items"><span>✓ Decision log architecture</span><span>○ Historical sync pending</span><span>○ Backtest dataset pending</span></div><a href="#/model" class="button button-primary">Explore Model Lab ↗</a></div>`;
}
function render(): void {
  state.page = getCurrentPage();
  const views:Record<Page,()=>string>={overview:dashboard,squad:squadPage,chase:chasePage,players:playersPage,fixtures:fixturesPage,goals:attackingPage,cleansheets:cleanSheetPage,solver:solverPage,strategy:strategyPage,model:modelPage,prices:pricesPage,review:reviewPage,data:dataPage};
  appRoot.innerHTML=shell(views[state.page]());
  bind();
  if (state.page === 'data') { void refreshDatasetStatus(); void loadPublicLeagueAudit(); }
  if (state.page === 'fixtures') void loadPublicFixtureMatrix();
  if (state.page === 'players' && appearanceStatus === 'unrequested') void loadAppearances();
}
type CommunityFixture = {code:string;team:string;opponent:string;venue:'H'|'A';gameweek:number;fdr:number;projectedGoals:number;csProbability:number;date:string};
async function loadPublicFixtureMatrix():Promise<void>{
  const node=document.querySelector<HTMLElement>('#public-league-matrix');
  if(!node)return;
  try{
    const startGw=state.gw;
    const weeks=Math.min(10,39-startGw);
    const sortGw=Math.max(startGw,Math.min(startGw+weeks-1,state.fixtureSortGw));
    const response=await fetch(`/api/v1/public/league/matrix?startGw=${startGw}&weeks=${weeks}&sortGw=${sortGw}`,{cache:'no-store'});
    if(!response.ok)throw new Error('Public fixture snapshot unavailable');
    const payload:unknown=await response.json();
    const content=payload as {mode?:string;rows?:{code:string;name:string;fixtures:CommunityFixture[]}[];source?:string};
    if(content.mode!=='community-reported'||!Array.isArray(content.rows)||!content.rows.length)throw new Error('Invalid public fixture data');
    const container=document.querySelector<HTMLElement>('#public-league-matrix');if(!container||state.page!=='fixtures'||state.gw!==startGw||state.fixtureSortGw!==sortGw)return;
    const headerCells=Array.from({length:weeks},(_,i)=>`<th><button type="button" class="gw-sort ${sortGw===startGw+i?'active':''}" data-gw-sort="${startGw+i}" aria-pressed="${sortGw===startGw+i}">GW ${startGw+i} ↕</button></th>`).join('');
    const rows=content.rows.map(team=>{
      const matches=team.fixtures.filter(fixture=>Number.isInteger(fixture.fdr)&&fixture.fdr>=1&&fixture.fdr<=5);
      const avg=matches.length?matches.reduce((total,fixture)=>total+fixture.fdr,0)/matches.length:0;
      const cells=Array.from({length:weeks},(_,i)=>{
        const fixture=matches.find(item=>item.gameweek===startGw+i);
        if(!fixture)return '<td class="unavailable-cell">—</td>';
        return `<td class="${sortGw===fixture.gameweek?'selected-gw':''}">${badgeFdr(fixture.fdr,`${fixture.opponent} [${fixture.venue}] - ${fixture.fdr}`)}<small class="community-cell-meta">${fixture.projectedGoals.toFixed(2)} goals · ${(fixture.csProbability*100).toFixed(0)}% CS</small></td>`;
      }).join('');
      return `<tr><td><div class="team-cell"><span class="club-icon" style="--club:${teamColors[team.code]??'#b5c7d0'}">${escapeHtml(team.code[0]??'?')}</span><div><strong>${escapeHtml(team.code)}</strong><small>${escapeHtml(team.name)}</small></div></div></td><td class="tabular"><strong>${avg.toFixed(1)}</strong></td>${cells}</tr>`;
    }).join('');
    container.innerHTML=`<div class="panel-head"><div><h3>Public-domain 2026/27 Fixture Matrix</h3><p>Independent model · ${content.rows.length} teams · click GW to sort easiest first</p></div><span class="tag source-tag">COMMUNITY FIXTURES</span></div><div class="table-scroll"><table class="fixture-table premium-fixtures community-fixtures"><thead><tr><th>CLUB</th><th>AVG FDR</th>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div><p class="source-caution">Data: OpenFootball CC0 public domain. Community reported; can be outdated. FDR is Vortex-derived, not the official FPL FDR. xG represents expected TEAM goals, not a named player's xG.</p>`;
    document.querySelector<HTMLElement>('#illustrative-fixtures')?.setAttribute('hidden','');
    container.querySelectorAll<HTMLButtonElement>('[data-gw-sort]').forEach(button=>button.addEventListener('click',()=>{state.fixtureSortGw=Number(button.dataset.gwSort);render();}));
  }catch{
    const current=document.querySelector<HTMLElement>('#public-league-matrix');
    if(current)current.innerHTML='<div class="panel-head"><div><h3>Public fixture source is unavailable</h3><p>Run <code>npm run league:sync</code> with network access to load community data. Synthetic example below remains clearly labeled.</p></div><span class="tag tag-neutral">DEMO FALLBACK</span></div>';
  }
}
async function loadPublicLeagueAudit():Promise<void>{
  const node=document.querySelector<HTMLElement>('#public-league-audit');if(!node)return;
  node.textContent='Loading reported league results…';
  try{
    const response=await fetch('/api/v1/public/league/backtest?endGw=6',{cache:'no-store'});
    if(!response.ok)throw new Error('No OpenFootball snapshot available yet');
    const payload:unknown=await response.json();
    const report=payload as {mode?:string;byGameweek?:{gameweek:number;scheduled:number;withReportedScores:number;missingScores:number;goalMae:number|null;csBrier:number|null;baselineGoalMae:number|null}[]};
    if(report.mode!=='retrospective-replay-not-archived-predictions'||!Array.isArray(report.byGameweek))throw new Error('Invalid league research report');
    const current=document.querySelector<HTMLElement>('#public-league-audit');if(!current||state.page!=='data')return;
    current.innerHTML=report.byGameweek.map(item=>`<div class="audit-gw"><strong>GW ${item.gameweek}</strong><small>${item.withReportedScores}/${item.scheduled} match results · ${item.missingScores} missing</small><small>${item.goalMae===null?'MAE unavailable':`Goal MAE ${item.goalMae.toFixed(2)}`}</small><small>${item.csBrier===null?'CS Brier unavailable':`CS Brier ${item.csBrier.toFixed(3)}`}</small></div>`).join('');
  }catch(error){const current=document.querySelector<HTMLElement>('#public-league-audit');if(current)current.textContent=error instanceof Error?error.message:'Public league data unavailable';}
}
async function loadAppearances():Promise<void> {
  appearanceStatus='loading';
  try {
    const response=await fetch('/api/v1/data/appearances',{cache:'no-store'});
    if(!response.ok)throw new Error('Appearances unavailable');
    const body:unknown=await response.json();
    if(!body||typeof body!=='object')throw new Error('Invalid appearance response');
    const result=body as {mode?:string;summaries?:AppearanceSummary[];appearances?:Appearance[]};
    if(result.mode==='licensed'&&Array.isArray(result.summaries)){
      appearanceSummaries.clear();appearanceRows.clear();
      for(const row of result.appearances??[]){const list=appearanceRows.get(row.playerId)??[];list.push(row);appearanceRows.set(row.playerId,list);}
      for(const item of result.summaries)appearanceSummaries.set(item.playerId,item);
      appearanceStatus='licensed';
    }else appearanceStatus='unavailable';
  }catch{appearanceStatus='unavailable';}
  if(state.page==='players')render();
}
async function runWeekAudit():Promise<void>{
  const destination=document.querySelector<HTMLElement>('#week-audit');
  if(!destination)return;
  destination.textContent='Checking archived forecasts and final outcomes…';
  try{
    const response=await fetch('/api/v1/research/gw-validation?modelId=vortex-research-v1',{cache:'no-store'});
    if(!response.ok)throw new Error(`Research API returned ${response.status}`);
    const payload:unknown=await response.json();
    if(!payload||typeof payload!=='object')throw new Error('Invalid audit response');
    const report=payload as {byGameweek?:{gameweek:number;samples:number;mae:number;rmse:number}[];readiness?:string};
    const weeks=report.byGameweek??[];
    destination.innerHTML=Array.from({length:6},(_,index)=>{
      const record=weeks.find(item=>item.gameweek===index+1);
      return `<div class=\"audit-gw\"><strong>GW ${index+1}</strong>${record?`<small>${record.samples} samples · MAE ${record.mae.toFixed(2)} · RMSE ${record.rmse.toFixed(2)}</small>`:'<small>Awaiting verified archived forecasts</small>'}</div>`;
    }).join('');
  }catch(error){destination.textContent=error instanceof Error?error.message:'Audit cannot run';}
}
async function refreshDatasetStatus(): Promise<void> {
  const node = document.querySelector<HTMLElement>('#data-studio-status');
  if (!node) return;
  try {
    const response = await fetch('/api/v1/data/status', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Data service returned ${response.status}`);
    const details: unknown = await response.json();
    if (details === null || typeof details !== 'object') throw new Error('Invalid data status');
    const status = details as { mode?: string; playerCount?: number; capturedAt?: string | null; stale?: boolean; rights?: {sourceName?: string} | null };
    const current = document.querySelector<HTMLElement>('#data-studio-status');
    if (!current) return;
    if (status.mode !== 'licensed') {
      current.textContent = 'Demo mode — no licensed data source connected. Dashboard predictions are illustrative.';
    } else {
      const source = status.rights?.sourceName ?? 'Authorized source';
      current.textContent = `${source} · ${status.playerCount ?? 0} players · Captured ${status.capturedAt ?? 'unknown'} · ${status.stale ? 'Stale snapshot' : 'Within configured freshness window'} · Trained model pending`;
    }
  } catch {
    const current = document.querySelector<HTMLElement>('#data-studio-status');
    if (current) current.textContent = 'Data service unavailable. All model outputs shown elsewhere are illustrative.';
  }
}
async function loadBacktest(): Promise<void> {
  const output = document.querySelector<HTMLElement>('#backtest-output');
  const season = document.querySelector<HTMLSelectElement>('#backtest-season')?.value;
  const modelId = document.querySelector<HTMLInputElement>('#backtest-model')?.value.trim();
  if (!output || !season || !modelId || !/^[a-zA-Z0-9][\w.-]{0,99}$/.test(modelId)) {
    if (output) output.textContent = 'Provide a valid model ID.';
    return;
  }
  output.textContent = 'Checking the research database…';
  try {
    const params = new URLSearchParams({season, modelId});
    const response = await fetch(`/api/v1/research/backtest?${params.toString()}`, {cache:'no-store'});
    if (!response.ok) {
      const failure: unknown = await response.json();
      const reason = failure && typeof failure === 'object' && 'error' in failure && typeof failure.error === 'string' ? failure.error : `HTTP ${response.status}`;
      throw new Error(reason);
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('metrics' in payload)) throw new Error('Invalid evaluation response');
    const summary = payload as {metrics: null | {samples:number;gameweeks:number;mae:number;rmse:number;meanBias:number;startingBrier:number;caution:string|null}};
    if (!summary.metrics) { output.textContent = 'No archived evaluation records for that season and model.'; return; }
    const metrics = summary.metrics;
    output.textContent = `${metrics.samples} archived player-GW observations across ${metrics.gameweeks} GWs · MAE ${metrics.mae.toFixed(2)} · RMSE ${metrics.rmse.toFixed(2)} · Bias ${metrics.meanBias.toFixed(2)} · Start Brier ${metrics.startingBrier.toFixed(3)}. ${metrics.caution ?? ''} These are exploratory until independent forecast timestamps are verified.`;
  } catch(error) { output.textContent = error instanceof Error ? error.message : 'Research database unavailable'; }
}
async function runSimulation(): Promise<void> {
  const output = document.querySelector<HTMLElement>('#simulation-result');
  const playerId = Number(document.querySelector<HTMLSelectElement>('#simulation-player')?.value);
  const gameweekIndex = Number(document.querySelector<HTMLSelectElement>('#simulation-gw')?.value);
  if (!output || !byId.has(playerId) || !Number.isInteger(gameweekIndex) || gameweekIndex < 0 || gameweekIndex > 9) return;
  output.textContent = 'Calculating illustrative distribution…';
  try {
    const response = await fetch(`/api/v1/model/distribution?playerId=${playerId}&gameweekIndex=${gameweekIndex}`, {cache: 'no-store'});
    if (!response.ok) throw new Error('Distribution unavailable');
    const result: unknown = await response.json();
    const payload = result as {mode?:string; model?: {expectedPoints?: number;p10?:number;p50?:number;p90?:number;probabilityOfBlank?:number;probabilityOfReturn?:number}};
    const forecast = payload.model;
    if (payload.mode !== 'illustrative' || !forecast || ![forecast.expectedPoints,forecast.p10,forecast.p50,forecast.p90,forecast.probabilityOfBlank,forecast.probabilityOfReturn].every(value=>typeof value === 'number' && Number.isFinite(value))) throw new Error('Invalid simulation result');
    output.textContent = `${byId.get(playerId)?.name ?? 'Player'} · Mean ${forecast.expectedPoints?.toFixed(2)} xPts · P10 ${forecast.p10?.toFixed(1)} · Median ${forecast.p50?.toFixed(1)} · P90 ${forecast.p90?.toFixed(1)} · Blank ${(Number(forecast.probabilityOfBlank)*100).toFixed(0)}% · Goal/assist return ${(Number(forecast.probabilityOfReturn)*100).toFixed(0)}%`;
  } catch {
    output.textContent = 'Simulation service unavailable. No forecast was generated.';
  }
}
function notify(message:string):void {state.notice=message;render();}
function saveSquad():void {
  const errors=validateSquad(demoPlayers,state.squad.selectedIds);
  if(errors.length){notify(errors.join('; '));return;}
  try {window.localStorage.setItem('fplvortex-demo-squad-v1',JSON.stringify(state.squad));notify('Demo squad saved on this device.');}
  catch {notify('Local storage unavailable. Your changes will reset after refresh.');}
}
function downloadCsv():void {
  const lines=['Player,Club,Position,Price,Starts,SubOn,SubOff,AvgMinutes,90s,Status,EstimatedStartProbability,Demo_xPoints',...filteredPlayers().map(player=>{const history=appearanceSummaries.get(player.id);return [player.name,player.club,player.position,player.price,history?.startsDisplay??'',history?.substituteAppearances??'',history?.substitutedOff??'',history?.minutesPerAppearance??'',history?.ninetyEquivalents??'',player.status,advancedForecast(player,state.gw-6).startProbability,currentHorizonPoints(player)].map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')})].join('\n');
  const blob=new Blob([lines],{type:'text/csv;charset=utf-8'});
  const address=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=address;anchor.download='fplvortex-demo-projections.csv';anchor.click();
  URL.revokeObjectURL(address);
}

/** Keep the source's real rank separate from illustrative transfer recommendations. */
async function syncFplLiveRank():Promise<void> {
  const input=document.querySelector<HTMLInputElement>('#chase-entry')?.value.trim()??'';
  if(!/^[1-9]\d{0,8}$/.test(input)){
    const node=document.querySelector<HTMLElement>('#chase-live-status');
    if(node)node.textContent='Enter a valid FPL team ID, then sync.';
    return;
  }
  const button=document.querySelector<HTMLButtonElement>('#chase-sync-live');
  const status=document.querySelector<HTMLElement>('#chase-live-status');
  if(button)button.disabled=true;
  if(status)status.textContent='Contacting FPL website for the current entry profile…';
  liveRankStatus='loading';
  try {
    const response=await fetch(`/api/v1/fpl/entry?entryId=${encodeURIComponent(input)}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`FPL source unavailable (HTTP ${response.status}); try again when connected.`);
    const raw:unknown=await response.json();
    if(!raw || typeof raw!=='object')throw new Error('Invalid FPL profile response');
    const source=raw as {mode?:string;entryId?:number;overallRank?:number|null;overallPoints?:number|null;currentGameweek?:number|null;teamName?:string;fetchedAt?:string;chipsPlayed?:{name:string;gameweek:number}[];bankInTenths?:number|null;teamValueInTenths?:number|null;picks?:LiveEntrySquad['picks'] & {playerIds:number[]}|null};
    if(source.mode!=='live-source-response'||source.entryId!==Number(input)||!Number.isInteger(source.overallRank)||!Number.isInteger(source.overallPoints))throw new Error('FPL has not published a complete verified rank and points snapshot yet.');
    rankProfile=parseRankChaseProfile({...rankProfile,entryId:source.entryId,overallRank:source.overallRank,overallPoints:source.overallPoints});
    try{window.localStorage.setItem('fplvortex-rank-chase-v1',JSON.stringify(rankProfile));}catch{/* local storage optional */}
    liveRankStatus='verified';
    liveEntrySquad={fetchedAt:source.fetchedAt??new Date().toISOString(),chipsPlayed:source.chipsPlayed??[],bankInTenths:source.bankInTenths??null,teamValueInTenths:source.teamValueInTenths??null,picks:source.picks??null};
    const used=source.chipsPlayed?.map(item=>`${item.name} GW${item.gameweek}`).join(', ') || 'not reported';
    liveRankDetail=`FPL response ${source.fetchedAt??'just now'} · ${source.teamName??'Team'} · overall rank ${source.overallRank?.toLocaleString()} · ${source.overallPoints} points · current GW${source.currentGameweek??'?'} · recorded chips: ${used} · ${source.picks?.playerIds?.length??0} current picks returned. These facts do NOT validate the demo squad or transfer advice.`;
    rankAdvice=null;
    if(state.page==='chase')render();
  }catch(error){
    liveRankStatus='failed';
    liveRankDetail=error instanceof Error?error.message:'FPL source unreachable. No rank was imported.';
    const current=document.querySelector<HTMLElement>('#chase-live-status');
    if(current)current.textContent=liveRankDetail;
  }finally{const current=document.querySelector<HTMLButtonElement>('#chase-sync-live');if(current)current.disabled=false;}
}

function bind():void {
  document.querySelector<HTMLButtonElement>('#chase-save')?.addEventListener('click',()=>{
    const get=(id:string):number|null=>{
      const input=document.querySelector<HTMLInputElement>(id)?.value.trim()??'';
      if(input==='')return null;
      const number=Number(input);
      return Number.isSafeInteger(number)&&number>=0?number:null;
    };
    const present=(id:string)=>document.querySelector<HTMLInputElement>(id)?.value.trim()??'';
    if((present('#chase-entry') && !get('#chase-entry')) || (present('#chase-rank')&&!get('#chase-rank')) || (present('#chase-points') && get('#chase-points')===null) || (present('#chase-benchmark') && get('#chase-benchmark')===null)){
      notify('Enter valid nonnegative whole numbers for team ID, rank and points.'); return;
    }
    const availableChips=Array.from(document.querySelectorAll<HTMLInputElement>('input[name="chase-chip"]:checked')).map(item=>item.value);
    const risk=document.querySelector<HTMLSelectElement>('#chase-risk')?.value??'balanced';
    rankProfile=parseRankChaseProfile({entryId:get('#chase-entry'),overallRank:get('#chase-rank'),overallPoints:get('#chase-points'),hypotheticalGw19Points:get('#chase-benchmark'),risk,availableChips});
    try {window.localStorage.setItem('fplvortex-rank-chase-v1',JSON.stringify(rankProfile));}catch {/* private browsing: use in-memory state */}
    liveRankStatus='manual'; liveEntrySquad=null; liveRankDetail='Profile values were entered manually; live rank not verified in this session.';
    rankAdvice=null;render();
  });
  document.querySelector<HTMLButtonElement>('#chase-sync-live')?.addEventListener('click',()=>{void syncFplLiveRank();});
  document.querySelector<HTMLButtonElement>('#swap-squad-player')?.addEventListener('click',()=>{
    const out=Number(document.querySelector<HTMLSelectElement>('#swap-out-player')?.value);
    const incoming=Number(document.querySelector<HTMLSelectElement>('#swap-in-player')?.value);
    const old=byId.get(out), replacement=byId.get(incoming);
    if(!old||!replacement||old.position!==replacement.position||!state.squad.selectedIds.includes(out)||state.squad.selectedIds.includes(incoming)){
      notify('Choose a valid same-position replacement outside your squad.');return;
    }
    const newIds=state.squad.selectedIds.map(id=>id===out?incoming:id);
    const error=validateSquad(demoPlayers,newIds);
    if(error.length){notify(error.join('; '));return;}
    const bank=Math.round((state.squad.bank+old.price-replacement.price)*10)/10;
    if(bank<-0.0001){notify('Not enough cash for that replacement.');return;}
    state.squad={...state.squad,selectedIds:newIds,bank:Math.max(0,bank),captainId:state.squad.captainId===out?incoming:state.squad.captainId};
    rankAdvice=null;solvedPlan=null;saveSquad();
  });

  document.querySelectorAll<HTMLButtonElement>('[data-gw-sort]').forEach(button=>button.addEventListener('click',()=>{state.fixtureSortGw=Number(button.dataset.gwSort);render();}));
  document.querySelectorAll<HTMLButtonElement>('[data-goal-sort]').forEach(button=>button.addEventListener('click',()=>{state.goalSort=button.dataset.goalSort as typeof state.goalSort;render();}));
  document.querySelectorAll<HTMLButtonElement>('[data-price-direction]').forEach(button=>button.addEventListener('click',()=>{state.priceDirection=button.dataset.priceDirection as typeof state.priceDirection;render();}));
  document.querySelector<HTMLButtonElement>('#run-deep-solver')?.addEventListener('click',()=>{
    const node=document.querySelector<HTMLElement>('#deep-plan');
    if(!node)return;
    node.textContent='Exploring budget-safe transfers, lineups and chip timing…';
    window.setTimeout(()=>{
      try{
        const weeks=Number(document.querySelector<HTMLSelectElement>('#solver-weeks')?.value??(17-state.gw));
        if(state.gw+weeks>17)throw new Error('The demo fixture horizon ends at GW16; select an earlier starting GW or shorter horizon.');
        solvedPlan=solveDeepPlan(demoPlayers,state.squad,state.gw,weeks);
        if(state.page==='solver'){const destination=document.querySelector<HTMLElement>('#deep-plan');if(destination)destination.innerHTML=displayDeepPlan(solvedPlan);}
      }catch(error){const destination=document.querySelector<HTMLElement>('#deep-plan');if(destination)destination.textContent=error instanceof Error?error.message:'Solver failed';}
    },30);
  });
  document.querySelectorAll<HTMLImageElement>('.portrait img').forEach(image=>image.addEventListener('error',()=>image.remove()));
  document.querySelector<HTMLButtonElement>('#public-league-audit-refresh')?.addEventListener('click',()=>{void loadPublicLeagueAudit();});
  document.querySelector<HTMLButtonElement>('#run-week-audit')?.addEventListener('click',()=>{void runWeekAudit();});
  document.querySelector<HTMLButtonElement>('#refresh-source')?.addEventListener('click', () => { void refreshDatasetStatus(); });
  document.querySelector<HTMLButtonElement>('#load-backtest')?.addEventListener('click', () => { void loadBacktest(); });
  document.querySelector<HTMLButtonElement>('#run-simulation')?.addEventListener('click', () => { void runSimulation(); });
  document.querySelector<HTMLButtonElement>('#mobile-toggle')?.addEventListener('click',()=>{state.menuOpen=!state.menuOpen;render();});
  document.querySelector<HTMLSelectElement>('#gw-select')?.addEventListener('change',event=>{const value=Number((event.target as HTMLSelectElement).value);state.gw=value;state.fixtureSortGw=value;state.horizon=Math.min(state.horizon,17-value);solvedPlan=null;render();});
  document.querySelector<HTMLSelectElement>('#horizon-select')?.addEventListener('change',event=>{const value=Number((event.target as HTMLSelectElement).value);state.horizon=value;render();});
  const search=document.querySelector<HTMLInputElement>('#player-search');
  search?.addEventListener('input',event=>{
    const input=event.target as HTMLInputElement;
    const selectionStart=input.selectionStart;
    state.search=input.value;
    render();
    const next=document.querySelector<HTMLInputElement>('#player-search');next?.focus();
    if(selectionStart!==null) next?.setSelectionRange(selectionStart,selectionStart);
  });
  document.querySelector<HTMLSelectElement>('#position-filter')?.addEventListener('change',event=>{state.position=(event.target as HTMLSelectElement).value as typeof state.position;render();});
  document.querySelector<HTMLSelectElement>('#sort-filter')?.addEventListener('change',event=>{state.sort=(event.target as HTMLSelectElement).value as typeof state.sort;render();});
  document.querySelector<HTMLButtonElement>('#csv-export')?.addEventListener('click',downloadCsv);
  document.querySelector<HTMLButtonElement>('#reset-squad')?.addEventListener('click',()=>{state.squad={...initialSquad,selectedIds:[...initialSquad.selectedIds]};saveSquad();});
  document.querySelectorAll<HTMLButtonElement>('.captain-toggle').forEach(button=>button.addEventListener('click',()=>{const id=Number(button.dataset.id);if(!state.squad.selectedIds.includes(id)){notify('Captain must be in your squad.');return;}state.squad.captainId=id;saveSquad();}));
  document.querySelector<HTMLButtonElement>('#save-squad')?.addEventListener('click',()=>{
    const bank=Number(document.querySelector<HTMLInputElement>('#bank-input')?.value);
    const freeTransfers=Number(document.querySelector<HTMLSelectElement>('#ft-input')?.value);
    if(!Number.isFinite(bank)||bank<0||bank>30||!Number.isInteger(freeTransfers)||freeTransfers<0||freeTransfers>5){notify('Enter a valid bank amount and transfer count.');return;}
    state.squad.bank=Math.round(bank*10)/10;state.squad.freeTransfers=freeTransfers;saveSquad();
  });
  document.querySelectorAll<HTMLButtonElement>('.add-player').forEach(button=>button.addEventListener('click',()=>{const player=byId.get(Number(button.dataset.player));if(player){state.search=player.name;state.position='ALL';window.location.hash='/players';notify(`${player.name}: ${(currentHorizonPoints(player)).toFixed(1)} illustrative xPts over ${state.horizon} gameweeks.`);}}));
}
window.addEventListener('hashchange',()=>{state.menuOpen=false;state.notice='';render();window.scrollTo({top:0,behavior:'instant'});});
render();