import { currentUser, rejectUntrustedOrigin } from "@/server/auth";
import { PayloadTooLargeError, readJsonLimited } from "@/server/requestBody";
import { optimizerJobKey, parseOptimizerJobRequest } from "@/lib/jobPolicy";
import { queueOptimizerJob } from "@/server/jobs/queue";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const rejected = rejectUntrustedOrigin(request);
  if (rejected) return rejected;
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  let job;
  try {
    const submitted = await readJsonLimited(request, 8 * 1024);
    job = parseOptimizerJobRequest(submitted);
  } catch (error) {
    return Response.json({ error: error instanceof PayloadTooLargeError ? "Request too large." : "Invalid job request." },
      { status: error instanceof PayloadTooLargeError ? 413 : 400 });
  }
  const key = optimizerJobKey(user.id, job);
  try {
    const queued = await queueOptimizerJob(user.id, key, job.entryId, job.horizon);
    if (!queued) return Response.json({ error: "Too many active jobs." }, { status: 429 });
    return Response.json({ ...queued, poll: `/api/jobs/${queued.id}` },
      { status: queued.status === "queued" ? 202 : 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Could not queue optimizer job", error);
    return Response.json({ error: "Job queue unavailable." }, { status: 503 });
  }
}
