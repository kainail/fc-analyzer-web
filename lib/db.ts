// Prisma client singleton.
//
// In dev, Next.js HMR throws away module state on every save. Without
// this pattern, each reload would instantiate a fresh PrismaClient,
// stack up connection pools, and exhaust the database's connection
// limit within a few minutes. Stashing the client on globalThis keeps
// the same instance across reloads.
//
// In production, modules are loaded once and globalThis is never
// reused, so the assignment is a no-op there.
//
// Prisma 7 removed direct DATABASE_URL connection from the client
// constructor — every client needs either a driver adapter or an
// Accelerate URL. We use @prisma/adapter-pg with the standard `pg`
// driver against Railway Postgres.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function makeClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — Prisma client cannot connect to Postgres.",
    );
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
