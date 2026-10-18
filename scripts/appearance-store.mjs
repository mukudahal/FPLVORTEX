import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { summarizeAppearances } from '../dist/js/vortex-analytics.js';

export async function readAppearanceSummary() {
  if (!process.env.VORTEX_APPEARANCES_PATH) return {mode:'unavailable', source:null, playerCount:0, summaries:[], message:'No authorized appearance data source configured'};
  const filename=resolve(process.env.VORTEX_APPEARANCES_PATH);
  const source=JSON.parse(await readFile(filename,'utf8'));
  if (source.schemaVersion!==1||source.season!=='2026/27'||!source.rights||source.rights.automatedProcessingPermitted!==true||source.rights.endUserDisplayPermitted!==true) throw new Error('Appearance source requires operator-verified authorized rights');
  if(typeof source.rights.sourceName!=='string'||typeof source.rights.licenseReference!=='string'||!source.rights.sourceName.trim()||!source.rights.licenseReference.trim())throw new Error('Missing source provenance');
  if(!Array.isArray(source.appearances)||source.appearances.length<1||source.appearances.length>40000)throw new Error('Invalid appearance rows');
  if(!Number.isFinite(Date.parse(source.capturedAt))||Date.parse(source.capturedAt)>Date.now())throw new Error('Invalid capture time');
  const ids=new Set();
  for(const row of source.appearances){
    if(!row||!Number.isSafeInteger(row.playerId)||row.playerId<1||!Number.isInteger(row.gameweek)||row.gameweek<1||row.gameweek>38)throw new Error('Invalid appearance identity');
    ids.add(row.playerId);
  }
  const summaries=[...ids].sort((a,b)=>a-b).map(playerId=>summarizeAppearances(playerId,source.appearances));
  return {mode:'licensed',source:{name:source.rights.sourceName,licenseReference:source.rights.licenseReference,capturedAt:source.capturedAt},playerCount:ids.size, appearances:source.appearances, summaries};
}