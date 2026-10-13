import { config } from "dotenv";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

config({
  path: process.env.PRISMA_ENV_FILE || ".env",
});

const useSupabase = process.env.PRISMA_ENV_FILE === ".env.supabase";

const connectionString = useSupabase
  ? process.env.DIRECT_URL
  : process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Database connection URL is not configured.");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });