/** Runtime configuration is validated at the boundary, not guessed by individual routes. */
export type Environment = Readonly<Record<string, string | undefined>>;

export function readDatabaseUrl(env: Environment = process.env): string {
  const supplied = env.DATABASE_URL?.trim();
  if (!supplied) throw new Error("DATABASE_URL is required to use PostgreSQL.");
  try {
    const url = new URL(supplied);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
      throw new Error("invalid PostgreSQL URL");
    }
    return supplied;
  } catch {
    throw new Error("DATABASE_URL must be a valid postgresql:// URL with a database name.");
  }
}

export function readPublicSiteUrl(env: Environment = process.env): string {
  const site = env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "http://localhost:3000");
  try {
    const url = new URL(site);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("invalid URL");
    }
    if (env.NODE_ENV === "production" && url.protocol !== "https:" && url.hostname !== "localhost") {
      throw new Error("production URL must be HTTPS");
    }
    return url.origin;
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute HTTP(S) origin without credentials or query parameters.");
  }
}

export function readCronSecret(env: Environment = process.env): string | null {
  const secret = env.CRON_SECRET;
  if (!secret || secret.length < 16) return null;
  return secret;
}

export interface AiConfiguration { apiKey: string; model: string }
export function readAiConfiguration(env: Environment = process.env): AiConfiguration | null {
  if (env.FPL_AI_ENABLED !== "true") return null;
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = env.FPL_COPILOT_MODEL?.trim();
  if (!apiKey || !model) {
    throw new Error("FPL_AI_ENABLED=true requires OPENAI_API_KEY and FPL_COPILOT_MODEL.");
  }
  return { apiKey, model };
}
