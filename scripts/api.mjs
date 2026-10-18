import { demoPlayers } from '../dist/js/model.js';
import { forecastDistribution } from '../dist/js/forecast-distribution.js';
import { getDatasetStatus, readCurrentSnapshot } from './read-snapshot.mjs';
import { createDatabasePool, readBacktest } from './history-store.mjs';
import { readAppearanceSummary } from './appearance-store.mjs';
import { readPublicLeague } from './public-league-store.mjs';
import { fixtureMatrix, leagueCoverage, retrospectiveTeamBacktest } from '../src/public-league.mjs';

let researchPoolPromise;
async function researchPool() {
  if (!researchPoolPromise) researchPoolPromise = createDatabasePool().catch(error=>{researchPoolPromise=undefined;throw error;});
  return researchPoolPromise;
}

function respond(response, statusCode, body, isHead = false) {
  const bytes = JSON.stringify(body);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'"
  });
  response.end(isHead ? undefined : bytes);
}
function queryInteger(raw, name, minimum, maximum) {
  if (!raw || !/^\d+$/.test(raw)) throw new RangeError(`${name} must be an integer`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new RangeError(`${name} must be from ${minimum} to ${maximum}`);
  return parsed;
}
export async function handleApi(request, response, address) {
  if (!address.pathname.startsWith('/api/')) return false;
  const isHead = request.method === 'HEAD';
  if (request.method !== 'GET' && !isHead) {
    response.setHeader('allow', 'GET, HEAD');
    respond(response, 405, { error: 'Method not allowed' });
    return true;
  }
  try {
    if (address.pathname === '/api/v1/health') {
      respond(response, 200, { ok: true, product: 'FPLVORTEX', apiVersion: 'v1' }, isHead);
    } else if (address.pathname === '/api/v1/data/status') {
      respond(response, 200, await getDatasetStatus(), isHead);
    } else if (address.pathname === '/api/v1/data/appearances') {
      respond(response, 200, await readAppearanceSummary(), isHead);
    } else if (address.pathname === '/api/v1/data/players') {
      const result = await readCurrentSnapshot();
      if (!result) {
        respond(response, 503, { error: 'No authorized player data connected', mode: 'demo' }, isHead);
        return true;
      }
      const status = await getDatasetStatus();
      respond(response, 200, { status, players: result.snapshot.players }, isHead);
    } else if (address.pathname.startsWith('/api/v1/public/league/')) {
      const league = await readPublicLeague();
      if (!league) {
        respond(response, 503, { mode: 'unavailable', error: 'Public-domain OpenFootball snapshot not yet synced; run npm run league:sync' }, isHead);
        return true;
      }
      if (address.pathname === '/api/v1/public/league/status') {
        respond(response, 200, { mode: 'community-reported', ...leagueCoverage(league) }, isHead);
      } else if (address.pathname === '/api/v1/public/league/matrix') {
        const startGw=queryInteger(address.searchParams.get('startGw')??'7','startGw',1,38);
        const weeks=queryInteger(address.searchParams.get('weeks')??'10','weeks',1,10);
        const sortGw=queryInteger(address.searchParams.get('sortGw')??String(startGw),'sortGw',1,38);
        respond(response, 200, { mode:'community-reported', ...fixtureMatrix(league,startGw,weeks,sortGw) }, isHead);
      } else if (address.pathname === '/api/v1/public/league/backtest') {
        const lastGw=queryInteger(address.searchParams.get('endGw')??'6','endGw',1,38);
        respond(response, 200, retrospectiveTeamBacktest(league,1,lastGw), isHead);
      } else {
        respond(response,404,{error:'Public league endpoint not found'},isHead);
      }
    } else if (address.pathname === '/api/v1/research/status') {
      respond(response, 200, { databaseConfigured: Boolean(process.env.DATABASE_URL), historicalEvaluation: 'requires validated archived forecasts', trainedModelAvailable: false }, isHead);
    } else if (address.pathname === '/api/v1/research/backtest') {
      if (!process.env.DATABASE_URL) {
        respond(response, 503, { error: 'Research database not configured', metrics: null }, isHead);
        return true;
      }
      const season = address.searchParams.get('season');
      const modelId = address.searchParams.get('modelId');
      const result = await readBacktest(await researchPool(), season, modelId);
      respond(response, 200, { ...result, warning: 'Temporal data checks do not prove forecasts were independently archived before kickoff. These metrics are exploratory until independently verified.' }, isHead);
    } else if (address.pathname === '/api/v1/research/gw-validation') {
      if (!process.env.DATABASE_URL) {
        respond(response, 200, {season:'2026/27', targetGameweeks:[1,2,3,4,5,6], readiness:'awaiting archived pre-deadline predictions and verified results', byGameweek:[], metrics:null}, isHead);
      } else {
        const modelId = address.searchParams.get('modelId') ?? 'vortex-research-v1';
        const results=await readBacktest(await researchPool(),'2026/27',modelId);
        respond(response, 200, {season:'2026/27',targetGameweeks:[1,2,3,4,5,6],readiness:results.metrics?'exploratory imported evaluation':'awaiting archived pre-deadline predictions and verified results',byGameweek:results.metrics?.byGameweek.filter(item=>item.gameweek<=6)??[],metrics:results.metrics??null,warning:'Do not interpret scores as percentage accuracy or true out-of-sample validation without independently archived timestamps.'},isHead);
      }
    } else if (address.pathname === '/api/v1/model/distribution') {
      const playerId = queryInteger(address.searchParams.get('playerId'), 'playerId', 1, 20_000_000);
      const gwIndex = queryInteger(address.searchParams.get('gameweekIndex') ?? '0', 'gameweekIndex', 0, 13);
      const player = demoPlayers.find(candidate => candidate.id === playerId);
      if (!player) {
        respond(response, 404, { error: 'Demo player not found' }, isHead);
        return true;
      }
      const forecast = forecastDistribution(player, gwIndex, 2_000, 1001);
      respond(response, 200, { mode: 'illustrative', trained: false, model: forecast }, isHead);
    } else {
      respond(response, 404, { error: 'API endpoint not found' }, isHead);
    }
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      respond(response, 400, { error: error.message }, isHead);
    } else {
      console.error('API request failed:', error);
      respond(response, 503, { error: 'Data or service temporarily unavailable' }, isHead);
    }
  }
  return true;
}