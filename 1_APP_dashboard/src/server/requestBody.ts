/** A bounded JSON reader to reject chunked oversized requests before buffering the full body. */
export class PayloadTooLargeError extends Error {
  constructor() { super("Request body exceeds configured limit."); }
}

export async function readJsonLimited(request: Request, limitBytes = 80 * 1024): Promise<unknown> {
  if (!Number.isInteger(limitBytes) || limitBytes < 1) throw new RangeError("Invalid body-size limit.");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limitBytes) throw new PayloadTooLargeError();
  if (!request.body) throw new SyntaxError("Missing request body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > limitBytes) throw new PayloadTooLargeError();
      chunks.push(result.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8"));
}
