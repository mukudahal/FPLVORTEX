import { demoPlayers } from '../dist/js/model.js';

export const fixedClock = new Date('2026-10-17T20:00:00.000Z');
export function sampleSnapshot() {
  return {
    schemaVersion: 1, season: '2026/27', gameweek: 8,
    capturedAt: '2026-10-17T18:00:00.000Z',
    rights: {
      sourceName: 'Test synthetic dataset',
      sourceReference: 'https://example.org/rights',
      licenseReference: 'unit-test-only-asset',
      verifiedBy: 'Unit test fixture', verifiedAt: '2026-10-17T18:00:00Z',
      automatedProcessingPermitted: true, endUserDisplayPermitted: true, modelTrainingPermitted: false
    },
    players: [ { ...demoPlayers[0], fixtures: [...demoPlayers[0].fixtures], imageCode: 223094 }, { ...demoPlayers[1], fixtures: [...demoPlayers[1].fixtures] } ]
  };
}
