import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readAppearanceSummary} from '../scripts/appearance-store.mjs';

test('appearance export derives confirmed starts, substitute-on, substitute-off and avg minutes',async()=>{
 const previous=process.env.VORTEX_APPEARANCES_PATH;
 const directory=await mkdtemp(join(tmpdir(),'vortex-appearances-'));
 const filename=join(directory,'approved.json');
 const rows=[
  {playerId:1,gameweek:1,minutes:90,started:true,substitutedOn:false,substitutedOff:false,available:true},
  {playerId:1,gameweek:2,minutes:59,started:true,substitutedOn:false,substitutedOff:true,available:true},
  {playerId:1,gameweek:3,minutes:21,started:false,substitutedOn:true,substitutedOff:false,available:true}
 ];
 try {
  const contents={schemaVersion:1,season:'2026/27',capturedAt:'2026-10-17T18:00:00Z',rights:{sourceName:'Licensed test fixture',licenseReference:'TEST-ONLY-NOT-A-LICENSE',automatedProcessingPermitted:true,endUserDisplayPermitted:true},appearances:rows};
  await writeFile(filename,JSON.stringify(contents));
  process.env.VORTEX_APPEARANCES_PATH=filename;
  const report=await readAppearanceSummary();
  assert.equal(report.mode,'licensed');
  assert.equal(report.summaries[0].startsDisplay,'2/3');
  assert.equal(report.summaries[0].substituteAppearances,1);
  assert.equal(report.summaries[0].substitutedOff,1);
  assert.equal(report.summaries[0].minutesPerAppearance,56.7);
  assert.equal(report.appearances.length,3);
  await writeFile(filename,JSON.stringify({...contents,rights:{...contents.rights,automatedProcessingPermitted:false}}));
  await assert.rejects(readAppearanceSummary(),/rights/i);
 } finally {
  if(previous===undefined)delete process.env.VORTEX_APPEARANCES_PATH;else process.env.VORTEX_APPEARANCES_PATH=previous;
  await rm(directory,{recursive:true,force:true});
 }
});