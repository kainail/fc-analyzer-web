// Constants shared between the server-side transcribe runner
// (lib/transcribe.ts) and Client Components that need to inspect
// metadata without pulling node:fs into the client bundle.
//
// This file must remain free of Node-only imports.

export const FFMPEG_MISSING_ERROR_MESSAGE =
  "ffmpeg not found on PATH — install ffmpeg to enable chunking for files >25MB.";
