import { readFile } from 'node:fs/promises';
import { saveForecastArchive } from '../server/forecastArchive.ts';
import type { Snapshot } from '../src/lib/types.ts';
const snapshot=JSON.parse(await readFile(process.env.VORTEX_SNAPSHOT_PATH??'public/data/fpl-snapshot.json','utf8')) as Snapshot;
const next=snapshot.gameweeks.find(g=>g.id===snapshot.meta.nextEventId);
if(!next || next.finished || Date.parse(next.deadlineTime)<=Date.now())console.log('No future pre-deadline Gameweek to archive.');
else console.log(await saveForecastArchive(snapshot));
