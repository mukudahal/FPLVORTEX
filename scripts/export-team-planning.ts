import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildTeamPlanningReport } from '../src/lib/teamPlanning.ts';
import type { Snapshot } from '../src/lib/types.ts';

// Explicit local input only. Retrieval time is preserved and checked; never backdate computation.
const [input, prefix, horizon = '5'] = process.argv.slice(2);
if (!input || !prefix) throw new Error('Usage: node --import tsx scripts/export-team-planning.ts SNAPSHOT OUTPUT_PREFIX [HORIZON]');
const bytes = await readFile(input);
const report = { ...buildTeamPlanningReport(JSON.parse(bytes.toString()) as Snapshot, Number(horizon)),
  inputSha256: createHash('sha256').update(bytes).digest('hex') };
await writeFile(`${prefix}.json`, JSON.stringify(report, null, 2) + '\n');
const csv = (v: unknown) => {
  let text = v == null ? '' : String(v);
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
const rows: unknown[][] = [['Team','GW','Opponent','Venue','Official FDR','Projected goals','CS probability','Win probability','Provisional attack index','Provisional defence index','Retrieved at','Computed at']];
for (const team of report.rows) for (const gw of team.gameweeks) {
  if (gw.blank) rows.push([team.team, gw.event, 'BLANK', '', '', 0, '', '', '', '', report.retrievedAt, report.computedAt]);
  for (const f of gw.matches) rows.push([team.team, gw.event, f.opponent, f.home ? 'H' : 'A', f.officialFdr, f.goals, f.cleanSheet, f.win, f.attackIndex, f.defenceIndex, report.retrievedAt, report.computedAt]);
}
await writeFile(`${prefix}.csv`, rows.map(row => row.map(csv).join(',')).join('\r\n') + '\r\n');
console.log(JSON.stringify({ teams: report.rows.length, events: report.events, retrievedAt: report.retrievedAt, computedAt: report.computedAt, inputSha256: report.inputSha256 }));
