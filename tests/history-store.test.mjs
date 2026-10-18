import test from 'node:test';
import assert from 'node:assert/strict';
import { storeHistory, readBacktest } from '../scripts/history-store.mjs';
import { historyFixture } from './history-fixtures.mjs';

const clock = new Date('2026-10-18T00:00:00Z');
class FakeClient {
  statements = [];
  imported = false;
  failOn = null;
  async query(sql, parameters=[]) {
    this.statements.push({sql,parameters});
    if (this.failOn && sql.includes(this.failOn)) throw new Error('Forced insert failure');
    if (sql.includes('INSERT INTO research_history_imports')) {
      if(this.imported) return {rowCount:0,rows:[]};
      this.imported = true;
      return {rowCount:1,rows:[{sha256:parameters[0]}]};
    }
    return {rowCount:1,rows:[]};
  }
}
test('transactional batch inserts parameterize every column and deduplicate repeat digests', async()=>{
  const client=new FakeClient();
  const first=await storeHistory(client,historyFixture(),{now:clock});
  assert.equal(first.imported,true);assert.equal(first.rows,3);
  const insert=client.statements.find(statement=>statement.sql.includes('INSERT INTO research_forecast_outcomes'));
  assert.equal(insert.parameters.length,33);
  assert.match(insert.sql,/\$11\)/);
  assert.match(insert.sql,/\$22\)/);
  assert.match(insert.sql,/\$33\)/);
  assert.deepEqual(client.statements.map(item=>item.sql==='BEGIN'?'BEGIN':item.sql==='COMMIT'?'COMMIT':'other').filter(x=>x!=='other'),['BEGIN','COMMIT']);
  const duplicate=await storeHistory(client,historyFixture(),{now:clock});
  assert.equal(duplicate.duplicate,true);
  assert.equal(client.statements.filter(statement=>statement.sql.includes('INSERT INTO research_forecast_outcomes')).length,1);
});
test('failure rolls back before recording partial imports',async()=>{
  const client=new FakeClient();client.failOn='INSERT INTO research_forecast_outcomes';
  await assert.rejects(()=>storeHistory(client,historyFixture(),{now:clock}),/Forced insert failure/);
  assert.equal(client.statements.at(-1).sql,'ROLLBACK');
});
test('API query validates season/model and converts PostgreSQL numeric strings',async()=>{
  const pool={async query(sql,args){assert.match(sql,/LIMIT 50001/);assert.deepEqual(args,['2025/26','vortex-prototype-0.2']);return {rows:[{playerId:11,gameweek:31,expectedPoints:'4',predictedStartProbability:'0.8',actualPoints:6,actualStarted:true}]};}};
  const report=await readBacktest(pool,'2025/26','vortex-prototype-0.2');
  assert.equal(report.metrics.mae,2);
  assert.equal(report.verifiedForecastArchive,false);
  await assert.rejects(()=>readBacktest(pool,'2025/26','evil\\;DROP TABLE --'),/Invalid modelId/);
});