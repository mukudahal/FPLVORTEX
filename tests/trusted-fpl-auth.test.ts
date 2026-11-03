import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import type { AuthenticatedFplRead } from '../server/authenticatedCurrentTeam.ts';
import {
  getTrustedFplReadForRequest,
  registerTrustedFplReadResolver,
} from '../server/trustedFplAuth.ts';

test('trusted current-team session is strictly request-scoped and unavailable by default',async()=>{
  const owned={caller:{verifiedAccountId:12345}} as unknown as Request;
  const stranger={caller:{verifiedAccountId:54321}} as unknown as Request;
  const absent={} as Request;
  assert.equal(await getTrustedFplReadForRequest(owned),null);
  registerTrustedFplReadResolver(async req=>{
    // Synthetic server-owned identity, not a browser-provided header/token.
    const account=(req as unknown as {caller?:{verifiedAccountId:number}})
      .caller?.verifiedAccountId;
    const read:AuthenticatedFplRead=async path=>
      path==='/me/'?{player:{entry:12345}}:{picks:[],chips:[],transfers:{}};
    return account===12345 ? read :null;
  });
  const ownedReader=await getTrustedFplReadForRequest(owned);
  assert.equal(typeof ownedReader,'function');
  assert.deepEqual(await ownedReader!('/me/'),{player:{entry:12345}});
  assert.equal(await getTrustedFplReadForRequest(stranger),null);
  assert.equal(await getTrustedFplReadForRequest(absent),null);
  assert.throws(()=>registerTrustedFplReadResolver(async()=>null),
    /already registered/);
});
