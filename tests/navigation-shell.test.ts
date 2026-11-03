import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveHashRoute} from '../src/hooks/useHashRoute.ts';
test('Dashboard is the default; existing Planner and Review bookmarks remain valid',()=>{
 assert.equal(resolveHashRoute(''),'command');
 assert.equal(resolveHashRoute('#/optimizer'),'optimizer');
 assert.equal(resolveHashRoute('#/review'),'review');
 assert.equal(resolveHashRoute('#/compare?ids=1,2'),'compare');
 assert.equal(resolveHashRoute('#/unknown'),'command');
});
