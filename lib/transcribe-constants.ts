// Constants shared between the server-side transcribe runner
// (lib/transcribe.ts) and Client Components that need to inspect
// metadata without pulling node:fs into the client bundle.
//
// This file must remain free of Node-only imports.

export const SIZE_LIMIT_ERROR_MESSAGE =
  "File exceeds Whisper 25MB limit — chunking not yet implemented.";
