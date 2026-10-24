import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { readFile } from 'node:fs/promises';
import { playerPhotoSources, playerPortrait, resetPlayerImageFailures, installPlayerImageFallbacks } from '../ui/player-images.js';

const code=stripTypeScriptTypes(await readFile(new URL('../model/dashboardMath.ts',import.meta.url),'utf8'),{mode:'strip'});
const {buildStrengths,projectMatch}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const neutral={atkH:1,atkA:1,defWeakH:1,defWeakA:1};
const fixture={finished:true,team_h:1,team_a:2};
const valid={id:1,strength_attack_home:1320,strength_attack_away:1100,strength_defence_home:1100,strength_defence_away:1100};
const mixed=buildStrengths([valid,{id:2}],[],[fixture]);
assert.equal(mixed.get(1).atkH,1.2,'Keep valid API ratings when another club lacks them');
assert.deepEqual(mixed.get(2),neutral,'No data means neutral, not a strong defence');
const invalid=buildStrengths([{id:1},{id:2}],[{team:1,minutes:100,expected_goals:'NaN',expected_goals_conceded_per_90:NaN}], [fixture]);
assert.deepEqual(invalid.get(1),neutral);
assert.deepEqual(buildStrengths([{id:1}],[],[]).get(1),neutral);
const baseline=projectMatch(neutral,neutral);
assert.equal(baseline.homeXg,1.55);assert.equal(baseline.awayXg,1.25);
assert.ok(Math.abs(baseline.homeWin+baseline.awayWin+baseline.draw-1)<1e-10);
assert.equal(baseline.homeCs,Math.exp(-1.25));
assert.throws(()=>projectMatch({...neutral,atkH:NaN},neutral),RangeError);
const sources=playerPhotoSources({code:199798,photo:'999999.png'});
assert.ok(sources.length>0&&sources.every(url=>url.endsWith('/199798.png')),'Official code takes precedence over a conflicting photo field');
assert.ok(sources.every(url=>!url.includes('/premierleague/photos/players/')),'Never restore the legacy unversioned source');
assert.deepEqual(playerPhotoSources({photo:'https://untrusted.test/photo.png'}),[]);
const listeners={};installPlayerImageFallbacks({addEventListener(name,fn){listeners[name]=fn;}});
const img={tagName:'IMG',classList:{contains:()=>true},dataset:{photoFallbacks:JSON.stringify(sources.slice(1))},src:sources[0],alt:'Player',parentElement:{}};
for(let i=1;i<sources.length;i++){listeners.error({target:img});assert.equal(img.src,sources[i]);}
listeners.error({target:img});assert.equal(img.hidden,true);
assert.equal(img.parentElement.title,'Player · Photo unavailable');
console.log('Dashboard missing-data, mixed-rating, probability and non-legacy image regressions passed.');

const player={code:465730,team:5,web_name:'De Cuyper'};
assert.ok(playerPhotoSources(player)[0].includes('/premierleague25/photos/players/110x140/'));
assert.ok(playerPhotoSources(player,true)[0].includes('/premierleague25/photos/players/500x500/'));
assert.ok(playerPhotoSources(player).every(url=>!url.includes('/premierleague26/')),'Asset namespace must not be guessed from the calendar');
const cacheListeners={};let installs=0;
const fakeDocument={addEventListener(name,fn){cacheListeners[name]=fn;installs++;}};
installPlayerImageFallbacks(fakeDocument);installPlayerImageFallbacks(fakeDocument);
assert.equal(installs,2,'Listeners install only once per document');
const markup=playerPortrait(player,value=>value);
const cachedImage={tagName:'IMG',classList:{contains:()=>true},dataset:{photoKey:markup.match(/data-photo-key="([^"]+)"/)[1],photoFallbacks:'[]'},src:playerPhotoSources(player)[0],alt:player.web_name,parentElement:{}};
cacheListeners.error({target:cachedImage});
assert.deepEqual(playerPhotoSources(player),[],'Exhausted photos are not fetched again on every redraw');
assert.ok(playerPortrait(player,value=>value).includes('Photo unavailable'));
assert.ok(playerPhotoSources({...player,team:9}).length>0,'A club change invalidates the cached result');
const originalNow=Date.now;
try {Date.now=()=>originalNow()+5*60*1000+1;assert.ok(playerPhotoSources(player).length>0,'Missing photos become eligible for retry');} finally {Date.now=originalNow;}
resetPlayerImageFailures();assert.ok(playerPhotoSources(player).length>0,'Refresh data retries failed photos');
cachedImage.hidden=false;cachedImage.dataset.photoFallbacks='{}';cacheListeners.error({target:cachedImage});assert.equal(cachedImage.hidden,true,'Malformed fallback metadata produces a clean missing state');
resetPlayerImageFailures();
console.log('Official image namespace, size selection, failure cache, expiry and refresh checks passed.');

assert.ok(playerPhotoSources({code:199798,birth_date:'1997-10-23'}).at(-1).startsWith('https://cdn.englandfootball.com/'),'Verified FA portrait backs up the missing PL headshot');
assert.ok(playerPhotoSources({code:199798,birth_date:'1997-06-06'}).every(url=>!url.includes('englandfootball.com')),'DOB conflicts reject cross-provider mapping');
assert.ok(playerPhotoSources({code:199799,birth_date:'1997-10-23'}).every(url=>!url.includes('englandfootball.com')),'Matching birth date alone never selects another player’s photo');
