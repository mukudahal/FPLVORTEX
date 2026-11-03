import { UpstreamHttpError } from './http.ts';

/** Public-safe categories only; never echo request URLs, environment or credentials. */
export function classifyRefreshError(error: unknown) {
  if (error instanceof UpstreamHttpError) return { kind: 'http', status: error.status };
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return { kind: 'timeout', status: null };
  if (error instanceof TypeError) return { kind: 'network', status: null };
  return { kind: 'invalid-payload', status: null };
}
