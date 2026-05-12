import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";
import path from "path";

loadEnv({ path: path.join(__dirname, ".env") });
loadEnv({
  path: path.join(__dirname, "..", "..", "artifacts", "api-server", ".env"),
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: "require",
  },
});
