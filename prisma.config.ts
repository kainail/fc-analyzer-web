// Prisma 7 config — loads DATABASE_URL from .env.local (Next.js
// convention) before .env. The Prisma CLI runs as a separate Node
// process from `next dev` / `next start`, so it doesn't see Next.js's
// auto-loaded .env.local unless we wire dotenv up here. The default
// `prisma init` template only loads .env, which gets shadowed by the
// placeholder values it writes there.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Prisma 7 reads the seed command from here, not package.json.
    // (The package.json "prisma.seed" entry is kept for documentation
    // and for any tooling that still introspects the legacy location.)
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
