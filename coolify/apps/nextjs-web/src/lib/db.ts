// Prisma client singleton (shared DB `ckk`, role `app`).
// Schema source of truth: <repo>/shared-db/prisma/schema — synced here via
// `pnpm db:sync-schema`, client generated with `pnpm db:generate`.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/client/client";

// Re-export the generated namespace (enums, Prisma.DbNull, input types) so
// feature code never needs the ../../generated relative path.
export { Prisma } from "../../generated/client/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

// Lazy proxy: the client (and its DATABASE_URL check) is created on first
// property access, not at import time — `next build` collects page data in an
// env without DATABASE_URL, so importing this module must never throw.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});
