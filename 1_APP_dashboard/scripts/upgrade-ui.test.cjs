'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
test('all 7 premium research views have dedicated Next.js routes',()=>{
  for(const route of ['review','leagues','threats','captaincy','market','injuries','predictions']){
    assert.ok(fs.existsSync(path.join(ROOT,'src','app',route,'page.tsx')),`${route} missing`);
  }
});
test('planner has all five demanded primary subtabs and no duplicate planner',()=>{
  const content=fs.readFileSync(path.join(ROOT,'src/components/planner/TeamPlanner.tsx'),'utf8');
  for(const text of ['Planner','Simulation','Chips Strategy','Price Increases','Injury List']) assert.ok(content.includes(text),text);
  assert.ok(!fs.existsSync(path.join(ROOT,'src/components/team/PlannerView.tsx')));
});
test('report renderer and archive operations are opt-in',()=>{
  assert.ok(fs.existsSync(path.join(ROOT,'scripts/reporting/render_report.py')));
  const sql=fs.readFileSync(path.join(ROOT,'migrations/0008_report_schedules.sql'),'utf8');
  assert.match(sql,/enabled BOOLEAN NOT NULL DEFAULT false/);
});
