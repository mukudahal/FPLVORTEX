import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addComparisonPlayer,moveComparisonPlayer,removeComparisonPlayer,initialComparisonIds} from '../src/lib/playerComparisonSelection.ts';
test('five selected users are retained in stable order and no duplicate is added',()=>{
 let ids:number[]=[];
 for(const id of [8,3,9,15,20])ids=addComparisonPlayer(ids,id);
 assert.deepEqual(ids,[8,3,9,15,20]);
 assert.deepEqual(addComparisonPlayer(ids,9),ids);
 assert.deepEqual(moveComparisonPlayer(ids,20,-1),[8,3,9,20,15]);
 assert.deepEqual(removeComparisonPlayer(ids,3),[8,9,15,20]);
});
test('new tab deep link normalizes invalid, duplicate and excess IDs',()=>{
 assert.deepEqual(initialComparisonIds('#/compare?ids=8,9,8,10,11,12'),[8,9,10,11,12]);
 assert.deepEqual(initialComparisonIds('#/compare?ids=5,0,-1,NaN,2'),[5,2]);
 assert.equal(initialComparisonIds('#/compare?ids=1,2,3,4,5,6,7,8,9').length,8);
});
