// Prisma client singleton — LAZY.
//
// We can't instantiate the client at module-eval time because Next's
// `next build` evaluates every module while collecting route data,
// and on Railway the DATABASE_URL env var is read at build start but
// may not be exposed to every build step that imports this file.
// Throwing here breaks the build. Instead we defer construction
// until the first property access via a Proxy: at runtime, the first
// `prisma.upload.findMany(...)` call triggers makeClient(), which
// reads DATABASE_URL and (if missing) throws with a clear message
// at the request handler boundary where it can be reported usefully.
//
// In dev, Next.js HMR throws away module state on every save. Without
// the globalThis stash, each reload would instantiate a fresh
// PrismaClient, stack up connection pools, and exhaust the database's
// connection limit within a few minutes. Production loads modules
// once, so the stash is a no-op there — the module-level cache below
// covers it.
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

let _client: PrismaClient | null = null;

function getOrCreateClient(): PrismaClient {
  // In dev, prefer the HMR-stashed instance if one exists. (Production
  // skips this branch — globalThis isn't reused across module loads.)
  if (process.env.NODE_ENV !== "production" && globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  if (_client) return _client;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — Prisma client cannot connect to Postgres. " +
        "Set it in .env.local (dev) or in the Railway service env vars (prod).",
    );
  }

  const adapter = new PrismaPg({ connectionString: url });
  const client = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

  _client = client;
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

// Lazy proxy: the underlying client is built on the first property
// read. Method delegates returned from the client (prisma.upload,
// prisma.transcript, etc.) are themselves bound to the real client,
// so subsequent calls like `.findMany(...)` work normally. Top-level
// methods (prisma.$transaction, prisma.$queryRaw, etc.) get bound
// to the client at access time so their `this` is correct.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getOrCreateClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
