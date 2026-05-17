This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Required environment

Set in `.env.local` (see `.env.example`):

- **Postgres**: `DATABASE_URL` — Railway connection string. Prisma client reads it via `@prisma/adapter-pg`.
- **Clerk**: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — auth + membership.
- **Cloudflare R2**: `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — object storage for audio + transcripts + analyses.
- **OpenAI**: `OPENAI_API_KEY` — Whisper transcription.
- **Anthropic**: `ANTHROPIC_API_KEY` — Claude analyzer.
- **`SKILL_PATH`** — local absolute path to the FC_Sales_Analyzer skill folder (`SKILL.md` + `methodology/` + `rubric/` + `schema/`). Still required: the analyzer loads the rubric/methodology/schema files from disk because they're version-controlled assets, not per-tenant content. Uploads, transcripts, and analyses themselves all live in Postgres + R2 now — SKILL_PATH no longer participates in the pipeline's write path.
- **Optional**: `FFMPEG_PATH` — override the ffmpeg binary location (defaults to PATH lookup, then a hardcoded Windows fallback). `ffmpeg` is required for transcribing recordings >25 MB.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
