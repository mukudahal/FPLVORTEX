import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { readDatabaseUrl } from "./src/lib/runtimeConfig";

config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: readDatabaseUrl() },
  strict: true,
  verbose: true,
});
