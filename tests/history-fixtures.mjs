export function historyFixture() {
  return {schemaVersion:1,season:'2025/26',modelId:'vortex-prototype-0.2',capturedAt:'2026-05-28T12:00:00Z',
    rights:{sourceName:'Synthetic integration fixture',sourceReference:'https://example.com/synthetic',licenseReference:'synthetic-test-data',
      verifiedBy:'Unit test',verifiedAt:'2026-05-28T11:00:00Z',automatedProcessingPermitted:true,
      endUserDisplayPermitted:true,modelTrainingPermitted:false},
    observations:[
      {playerId:11,gameweek:31,predictedAt:'2026-03-19T12:00:00Z',kickoffAt:'2026-03-20T16:00:00Z',expectedPoints:4,predictedStartProbability:0.8,actualPoints:6,actualStarted:true},
      {playerId:12,gameweek:31,predictedAt:'2026-03-19T12:00:00Z',kickoffAt:'2026-03-20T16:00:00Z',expectedPoints:2,predictedStartProbability:0.3,actualPoints:0,actualStarted:false},
      {playerId:11,gameweek:32,predictedAt:'2026-03-27T12:00:00Z',kickoffAt:'2026-03-28T16:00:00Z',expectedPoints:3,predictedStartProbability:0.7,actualPoints:4,actualStarted:true}
    ]};
}