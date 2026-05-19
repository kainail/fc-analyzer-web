// Cloudflare R2 storage client + helpers.
//
// R2 is S3-compatible — we use the AWS SDK pointed at the R2 S3
// endpoint. Auth happens via the access key pair that R2 issues per
// API token; region is "auto" (R2 doesn't use AWS regions). The
// account-level S3 endpoint lives at
// https://<accountid>.r2.cloudflarestorage.com and is stored in
// R2_ENDPOINT.
//
// R2 key convention is org-scoped so cross-tenant access is impossible
// just by getting the key right:
//   uploads/<orgSlug>/<uploadId>/<filename>          audio recording
//   transcripts/<orgSlug>/<uploadId>/transcript.txt  whisper text
//   transcripts/<orgSlug>/<uploadId>/transcript.json whisper verbose
//   analyses/<orgSlug>/<uploadId>/analysis.json      analyzer JSON
//   analyses/<orgSlug>/<uploadId>/coaching.md        coaching message

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = "auto";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set — R2 storage cannot be reached. Set it in .env.local.`,
    );
  }
  return v;
}

// Lazy singleton so we don't try to read env at module-eval time on
// the client bundle. Server-only paths (route handlers, after())
// trigger the first call.
let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: REGION,
    endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
    // R2 quirks: it doesn't support the AWS Trailer-based checksum
    // header that the v3 SDK adds by default. Force path-style URLs
    // so we hit <endpoint>/<bucket>/<key> instead of
    // <bucket>.<endpoint>/<key> which R2 doesn't route.
    forcePathStyle: true,
  });
  return _client;
}

function bucket(): string {
  return requireEnv("R2_BUCKET");
}

// --- core ops ---------------------------------------------------------------

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function downloadFromR2(key: string): Promise<Buffer> {
  const res: GetObjectCommandOutput = await client().send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
    }),
  );
  if (!res.Body) {
    throw new Error(`R2 object missing body: ${key}`);
  }
  // res.Body is a Readable stream in Node — convert to Buffer.
  const chunks: Buffer[] = [];
  const stream = res.Body as NodeJS.ReadableStream;
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// Presigned PUT URL for direct browser → R2 upload. ContentType is
// intentionally NOT included in the signature so the browser is free
// to PUT with whatever content-type the File carries (or none) —
// otherwise the upload would 403 on header mismatch.
export async function presignAudioPut(
  key: string,
  expiresInSec = 15 * 60,
): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
    }),
    { expiresIn: expiresInSec },
  );
}

export async function deleteFromR2(key: string): Promise<void> {
  await client().send(
    new DeleteObjectCommand({
      Bucket: bucket(),
      Key: key,
    }),
  );
}

// Public URL for an object. R2 only serves these publicly when the
// bucket has a public R2.dev or custom-domain binding enabled; for
// private buckets, callers should use a presigned URL instead (TBD —
// once we know whether to expose audio bytes to the browser directly
// or proxy through the app).
export function getR2Url(key: string): string {
  return `${requireEnv("R2_ENDPOINT")}/${bucket()}/${key}`;
}

// --- key helpers ------------------------------------------------------------
//
// Keys are scoped by orgSlug first so a bucket-list (or any future
// cross-org tooling) trivially groups by tenant. uploadId is the
// Upload row's cuid; filenames inside each prefix are deterministic
// so re-running a pipeline step overwrites cleanly.

export function audioKey(
  orgSlug: string,
  uploadId: string,
  filename: string,
): string {
  return `uploads/${orgSlug}/${uploadId}/${filename}`;
}

export function transcriptTextKey(orgSlug: string, uploadId: string): string {
  return `transcripts/${orgSlug}/${uploadId}/transcript.txt`;
}

export function transcriptJsonKey(orgSlug: string, uploadId: string): string {
  return `transcripts/${orgSlug}/${uploadId}/transcript.json`;
}

export function analysisJsonKey(orgSlug: string, uploadId: string): string {
  return `analyses/${orgSlug}/${uploadId}/analysis.json`;
}

export function coachingKey(orgSlug: string, uploadId: string): string {
  return `analyses/${orgSlug}/${uploadId}/coaching.md`;
}
