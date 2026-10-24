'use strict';
require('./register-typescript.cjs');
const { test }=require('node:test');
const assert=require('node:assert/strict');
const {dueReportLocalSlot}=require('../src/lib/reportScheduling.ts');
const schedule={userId:'u1',entryId:5,timezone:'America/New_York',amHour:5,amMinute:30,pmHour:17,pmMinute:20,enabled:true};
test('report slots honor DST offsets and do not schedule off-slot',()=>{
  assert.match(dueReportLocalSlot(schedule,new Date('2026-10-23T09:30:00Z')),/05:30$/);
  assert.match(dueReportLocalSlot(schedule,new Date('2026-12-23T10:30:00Z')),/05:30$/);
  assert.match(dueReportLocalSlot(schedule,new Date('2026-10-23T21:20:00Z')),/17:20$/);
  assert.equal(dueReportLocalSlot(schedule,new Date('2026-10-23T09:40:00Z')),null);
  assert.equal(dueReportLocalSlot({...schedule,enabled:false},new Date('2026-10-23T09:30:00Z')),null);
});
