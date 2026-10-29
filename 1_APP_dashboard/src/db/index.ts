import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readDatabaseUrl } from "@/lib/runtimeConfig";

// The module is also imported while Next.js collects route metadata during
// production builds. Only enforce the database requirement when a query runs.
const configuredUrl = process.env.DATABASE_URL?.trim();
const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

const underlyingPool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: configuredUrl ? readDatabaseUrl() : undefined,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = underlyingPool;
}

// Fail explicitly if any database-backed route is called without DATABASE_URL,
// while allowing database-independent pages and Next.js builds to load.
export const pool: Pool = configuredUrl
  ? underlyingPool
  : new Proxy(underlyingPool, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        if (property === "query" || property === "connect") {
          return (...args: unknown[]) => {
            readDatabaseUrl();
            return Reflect.apply(value, target, args);
          };
        }
        return value.bind(target);
      },
    });

export const db = drizzle(pool);
