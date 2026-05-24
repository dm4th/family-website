import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// We author SQL migrations via the Supabase CLI in supabase/migrations/.
// Drizzle is used here only for type generation; running `drizzle-kit generate`
// would write to ./drizzle so it never collides with the canonical SQL files.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
