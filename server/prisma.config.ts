import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({
  path: process.env.PRISMA_ENV_FILE || ".env",
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.PRISMA_ENV_FILE === ".env.supabase"
      ? env("DIRECT_URL")
      : env("DATABASE_URL"),
  },
});