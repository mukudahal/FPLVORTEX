import { pool } from "@/db";
import { currentUser } from "@/server/auth";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid job ID." }, { status: 400 });
  try {
    const rows = await pool.query(`SELECT id,kind,status,attempts,max_attempts,result,created_at,
      finished_at FROM background_jobs WHERE id=$1 AND user_id=$2`, [id, user.id]);
    return rows.rows[0]
      ? Response.json(rows.rows[0], { headers: { "cache-control": "no-store" } })
      : Response.json({ error: "Job not found." }, { status: 404 });
  } catch {
    return Response.json({ error: "Job status unavailable." }, { status: 503 });
  }
}
