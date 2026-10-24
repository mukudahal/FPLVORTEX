export interface OptimizerJobRequest { entryId: number; horizon: number; requestId: string }
export function parseOptimizerJobRequest(value: unknown): OptimizerJobRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid optimizer job.");
  const body = value as Record<string, unknown>;
  const entryId = Number(body.entryId);
  const horizon = Number(body.horizon ?? 5);
  const requestId = body.requestId;
  if (!Number.isSafeInteger(entryId) || entryId <= 0 || !Number.isInteger(horizon) || horizon < 1 || horizon > 10
      || typeof requestId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new TypeError("Optimizer job requires valid entryId, horizon (1–10), and UUID requestId.");
  }
  return { entryId, horizon, requestId: requestId.toLowerCase() };
}

export function optimizerJobKey(userId: string, request: OptimizerJobRequest): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new TypeError("Invalid job owner.");
  return `optimizer:${userId}:${request.requestId}`;
}

export function retryDelaySeconds(attempts: number): number {
  if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError("Invalid attempt count.");
  return Math.min(15 * 60, 30 * 2 ** (attempts - 1));
}
