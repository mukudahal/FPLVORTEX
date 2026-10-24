'use strict';
require('./register-typescript.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const { assessModelDrift }=require('../src/lib/modelDrift.ts');
const original={sampleSize:1200,mae:3.1,rmse:4.3,bias:0.1,p60Brier:0.18,bins:[],excludedAfterDeadline:0};
test('insufficient sample prevents misleading automatic drift decisions',()=>{
 assert.equal(assessModelDrift(original,{...original,sampleSize:12,mae:10}).status,'insufficient_data');
});
test('material degradation flags investigation, not unchecked retraining',()=>{
 assert.equal(assessModelDrift(original,{...original,sampleSize:140,mae:4.3}).status,'investigate');
 assert.equal(assessModelDrift(original,{...original,sampleSize:140,mae:3.2}).status,'healthy');
});
