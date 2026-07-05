// Prisma client singleton (shared DB `ckk`, role `app`).
// Schema source of truth: <repo>/shared-db/prisma/schema — synced here via
// `pnpm db:sync-schema`, client generated with `pnpm db:generate`.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/client/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
