import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizePlayerMatchHistory,summarizePlayerRange} from '../src/lib/playerHistory.ts';
const official={history:[
 {fixture:101,round:4,element:12,starts:1,minutes:80,total_points:9,goals_scored:1,assists:0,clean_sheets:0,expected_goals:'0.82',expected_assists:'0.24'},
 {fixture:102,round:4,element:12,starts:0,minutes:18,total_points:1,goals_scored:0,assists:0,clean_sheets:0,expected_goals:'0.11',expected_assists:'0.04'},
 {fixture:107,round:5,element:12,starts:1,minutes:90,total_points:7,goals_scored:0,assists:1,clean_sheets:1,expected_goals:'0.51',expected_assists:'0.62'},
]};
test('only selected GWs aggregate each official fixture including a double GW',()=>{
 const rows=normalizePlayerMatchHistory(official,12);
 assert.equal(rows.length,3);
 assert.deepEqual(summarizePlayerRange(rows,4,4),{starts:1,minutes:98,totalPoints:10,goals:1,assists:0,cleanSheets:0,xG:0.93,xA:0.28});
 assert.equal(summarizePlayerRange(rows,5,5).totalPoints,7);
 assert.equal(summarizePlayerRange(rows,1,2).totalPoints,null);
});
test('missing supported field stays unknown, not fabricated zero',()=>{
 const rows=normalizePlayerMatchHistory({history:[{fixture:7,round:1,element:12,total_points:0,minutes:0}]},12);
 assert.equal(summarizePlayerRange(rows,1,1).totalPoints,0);
 assert.equal(summarizePlayerRange(rows,1,1).xG,null);
 assert.equal(summarizePlayerRange(rows,1,1).starts,null);
});
test('reject duplicate fixture and inconsistent player ID',()=>{
 assert.throws(()=>normalizePlayerMatchHistory({history:[official.history[0],official.history[0]]},12),/duplicate/);
 assert.throws(()=>normalizePlayerMatchHistory(official,999),/identity/);
});
