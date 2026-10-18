/** Validates an as-of historical evaluation bundle. Temporal assertions alone cannot prove a forecast was recorded before kickoff. */
const MAX_OBSERVATIONS = 40_000;
const integer = (value, label, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`${label} must be an integer in [${min},${max}]`);
  return value;
};
const numeric = (value, label, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new RangeError(`${label} must be a finite number in [${min},${max}]`);
  return value;
};
const required = (value, label, maximum = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new TypeError(`${label} must be a non-empty string (max ${maximum})`);
  return value.trim();
};
const object = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
};
const instant = (value, label, now) => {
  const text = required(value, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) throw new TypeError(`${label} needs an ISO timestamp with timezone`);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || parsed > now.getTime() + 300_000) throw new RangeError(`${label} invalid or in the future`);
  return new Date(parsed).toISOString();
};

export function validateHistoryBundle(raw, now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new TypeError('Invalid validation clock');
  const data = object(raw, 'history');
  if (data.schemaVersion !== 1) throw new RangeError('Unsupported history schema');
  const season = required(data.season, 'season', 7);
  if (!/^20\d{2}\/\d{2}$/.test(season) || ((Number(season.slice(2,4)) + 1) % 100) !== Number(season.slice(5))) throw new TypeError('Invalid season');
  const modelId = required(data.modelId, 'modelId', 100);
  if (!/^[a-zA-Z0-9][\w.-]{0,99}$/.test(modelId)) throw new TypeError('Unsafe modelId');
  const capturedAt = instant(data.capturedAt, 'capturedAt', now);
  const rightsIn = object(data.rights, 'rights');
  const rights = {
    sourceName: required(rightsIn.sourceName, 'rights.sourceName', 120),
    sourceReference: required(rightsIn.sourceReference, 'rights.sourceReference', 500),
    licenseReference: required(rightsIn.licenseReference, 'rights.licenseReference', 500),
    verifiedBy: required(rightsIn.verifiedBy, 'rights.verifiedBy', 120),
    verifiedAt: instant(rightsIn.verifiedAt, 'rights.verifiedAt', now),
    automatedProcessingPermitted: rightsIn.automatedProcessingPermitted === true,
    endUserDisplayPermitted: rightsIn.endUserDisplayPermitted === true,
    modelTrainingPermitted: rightsIn.modelTrainingPermitted === true
  };
  if (!rights.automatedProcessingPermitted || !rights.endUserDisplayPermitted) throw new Error('History source rights have not been approved for automated analysis and display');
  if (!Array.isArray(data.observations) || data.observations.length === 0 || data.observations.length > MAX_OBSERVATIONS) {
    throw new RangeError(`observations needs 1–${MAX_OBSERVATIONS} records`);
  }
  const seen = new Set();
  const observations = data.observations.map((entry, index) => {
    const observation = object(entry, `observations[${index}]`);
    const playerId = integer(observation.playerId, `observations[${index}].playerId`, 1, 20_000_000);
    const gameweek = integer(observation.gameweek, `observations[${index}].gameweek`, 1, 38);
    const key = `${playerId}:${gameweek}`;
    if (seen.has(key)) throw new Error(`Duplicate player-gameweek entry: ${key}`);
    seen.add(key);
    const predictedAt = instant(observation.predictedAt, 'predictedAt', now);
    const kickoffAt = instant(observation.kickoffAt, 'kickoffAt', now);
    if (Date.parse(predictedAt) >= Date.parse(kickoffAt)) throw new RangeError(`Prediction must precede kickoff: ${key}`);
    if (Date.parse(kickoffAt) > Date.parse(capturedAt)) throw new RangeError(`Outcome not yet observable at capturedAt: ${key}`);
    if (Date.parse(predictedAt) > Date.parse(capturedAt)) throw new RangeError(`Prediction after capture: ${key}`);
    if (typeof observation.actualStarted !== 'boolean') throw new TypeError(`actualStarted must be boolean: ${key}`);
    return {
      playerId, gameweek, predictedAt, kickoffAt,
      expectedPoints: numeric(observation.expectedPoints, 'expectedPoints', -10, 50),
      predictedStartProbability: numeric(observation.predictedStartProbability, 'predictedStartProbability', 0, 1),
      actualPoints: integer(observation.actualPoints, 'actualPoints', -10, 70),
      actualStarted: observation.actualStarted
    };
  });
  observations.sort((left,right) => left.gameweek-right.gameweek || left.playerId-right.playerId);
  return { schemaVersion: 1, season, modelId, capturedAt, rights, observations };
}

/** Metrics from strictly held-out archived forecasts; no model training or fitting is performed here. */
export function evaluateBacktest(observations) {
  if (!Array.isArray(observations) || observations.length === 0) return null;
  let absoluteError = 0, squaredError = 0, signedError = 0, brierSum = 0;
  let sumActual = 0, sumPredicted = 0;
  const perWeek = new Map();
  const calibration = Array.from({length: 10}, () => ({ samples: 0, predictedSum: 0, started: 0 }));
  for (const observation of observations) {
    const predicted = numeric(observation.expectedPoints, 'expectedPoints', -10, 50);
    const actual = numeric(observation.actualPoints, 'actualPoints', -10, 70);
    const probability = numeric(observation.predictedStartProbability, 'predictedStartProbability', 0, 1);
    if (typeof observation.actualStarted !== 'boolean') throw new TypeError('actualStarted must be a boolean');
    const gameweek = integer(observation.gameweek, 'gameweek', 1, 38);
    const difference = predicted - actual;
    absoluteError += Math.abs(difference);
    squaredError += difference*difference;
    signedError += difference;
    sumActual += actual;
    sumPredicted += predicted;
    brierSum += (probability - Number(observation.actualStarted))**2;
    const bucket = calibration[Math.min(9, Math.floor(probability * 10))];
    bucket.samples += 1;
    bucket.predictedSum += probability;
    bucket.started += Number(observation.actualStarted);
    const gw = perWeek.get(gameweek) ?? { gameweek, samples: 0, absoluteError: 0, squaredError: 0 };
    gw.samples += 1;
    gw.absoluteError += Math.abs(difference);
    gw.squaredError += difference*difference;
    perWeek.set(gameweek, gw);
  }
  const round = value => Number(value.toFixed(4));
  const samples = observations.length;
  return {
    samples,
    gameweeks: perWeek.size,
    mae: round(absoluteError / samples),
    rmse: round(Math.sqrt(squaredError / samples)),
    meanBias: round(signedError / samples),
    meanPredictedPoints: round(sumPredicted / samples),
    meanActualPoints: round(sumActual / samples),
    startingBrier: round(brierSum / samples),
    caution: samples < 100 ? 'Small sample: do not use these results to claim model accuracy.' : null,
    byGameweek: [...perWeek.values()].sort((a,b)=>a.gameweek-b.gameweek).map(week=>({
      gameweek:week.gameweek, samples:week.samples, mae:round(week.absoluteError/week.samples), rmse:round(Math.sqrt(week.squaredError/week.samples))
    })),
    startingCalibration: calibration.map((bucket,index)=>({
      probabilityBand:`${index*10}-${(index+1)*10}%`,samples:bucket.samples,
      meanPredicted:bucket.samples?round(bucket.predictedSum/bucket.samples):null,
      observedRate:bucket.samples?round(bucket.started/bucket.samples):null
    }))
  };
}