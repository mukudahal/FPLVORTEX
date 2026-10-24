import { pool } from "@/db";
import { hashPassword, isValidToken, issueToken, tokenDigest } from "@/lib/authCrypto";
import type { EmailPurpose } from "@/server/authEmail";

export async function createAuthToken(userId: string, purpose: EmailPurpose): Promise<string> {
  const { plain, digest } = issueToken();
  const lifetime = purpose === "verify" ? "24 hours" : "30 minutes";
  await pool.query(`INSERT INTO auth_tokens(user_id,token_hash,purpose,expires_at)
    VALUES ($1,$2,$3,NOW() + $4::interval)`, [userId, digest, purpose, lifetime]);
  return plain;
}

/** One-time token consumption is serialized in a transaction to prevent replay. */
export async function consumeAuthToken(token: unknown, purpose: EmailPurpose, password?: string): Promise<boolean> {
  if (!isValidToken(token)) return false;
  if (purpose === "reset") {
    const valid = await pool.query(`SELECT 1 FROM auth_tokens
      WHERE token_hash=$1 AND purpose='reset' AND consumed_at IS NULL AND expires_at > NOW() LIMIT 1`, [tokenDigest(token)]);
    if (!valid.rows.length) return false;
  }
  const newHash = purpose === "reset" && password ? await hashPassword(password) : null;
  if (purpose === "reset" && !newHash) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ id: string; user_id: string }>(`
      SELECT id, user_id FROM auth_tokens
      WHERE token_hash=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at > NOW()
      FOR UPDATE`, [tokenDigest(token), purpose]);
    const row = found.rows[0];
    if (!row) { await client.query("ROLLBACK"); return false; }
    if (purpose === "verify") {
      await client.query("UPDATE app_users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at=NOW() WHERE id=$1", [row.user_id]);
    } else {
      await client.query("UPDATE app_users SET password_hash=$1, updated_at=NOW() WHERE id=$2", [newHash, row.user_id]);
      await client.query("DELETE FROM auth_sessions WHERE user_id=$1", [row.user_id]);
    }
    await client.query("UPDATE auth_tokens SET consumed_at=NOW() WHERE id=$1", [row.id]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
