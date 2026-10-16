import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({
  path: process.env.PRISMA_ENV_FILE || ".env",
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Generation needs only the schema; database commands require a configured URL.
  datasource: {
    url: process.env.PRISMA_ENV_FILE === ".env.supabase"
      ? process.env.DIRECT_URL
      : process.env.DATABASE_URL,
  },
});
