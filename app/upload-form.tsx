"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OUTCOME_GROUPS } from "@/lib/outcomes";
import { fmtFileSize } from "@/lib/format";
import {
  CheckCirc,
  Clock,
  Doc,
  Help,
  Mic,
  Upload as UploadIcon,
  X,
} from "@/lib/icons";

// No props — rep comes from the authenticated Clerk user, gym from
// their Organization. The pre-migration freeform dropdowns are gone.
type Props = Record<string, never>;

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXT = ["mp3", "m4a", "wav", "ogg", "aac", "flac"];

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type RecordingTypeOption = "full" | "qualify_only" | "close_only" | "split";

const RECORDING_TYPE_OPTIONS: Array<{
  value: RecordingTypeOption;
  label: string;
}> = [
  { value: "full", label: "Full Consultation" },
  { value: "qualify_only", label: "Qualify Only" },
  { value: "close_only", label: "Close Only" },
  { value: "split", label: "Split – Two Parts" },
];

export default function UploadForm(_props: Props) {
  const router = useRouter();

  const [prospect, setProspect] = useState("");
  const [consultationDate, setConsultationDate] = useState(todayIso());
  const [outcome, setOutcome] = useState("");
  const [recordingType, setRecordingType] =
    useState<RecordingTypeOption>("full");
  const [file, setFile] = useState<File | null>(null);
  const [audioPart2, setAudioPart2] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [drag2, setDrag2] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileRef2 = useRef<HTMLInputElement>(null);

  function acceptFile(f: File | null): boolean {
    if (!f) {
      setFile(null);
      return false;
    }
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXT.includes(ext)) {
      setError(`Audio must be one of: ${ALLOWED_EXT.join(", ")} (got "${f.name}")`);
      setFile(null);
      return false;
    }
    if (f.size > MAX_BYTES) {
      setError(`File too large: ${fmtFileSize(f.size)} exceeds the 100 MB limit`);
      setFile(null);
      return false;
    }
    setError(null);
    setFile(f);
    return true;
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!acceptFile(f)) e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    acceptFile(f);
  }

  // Part 2 mirrors acceptFile / onFileChange / onDrop above. Kept as
  // parallel functions rather than refactoring acceptFile into a
  // shared helper so the existing main-file path is untouched.
  function acceptFilePart2(f: File | null): boolean {
    if (!f) {
      setAudioPart2(null);
      return false;
    }
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXT.includes(ext)) {
      setError(`Part 2 audio must be one of: ${ALLOWED_EXT.join(", ")} (got "${f.name}")`);
      setAudioPart2(null);
      return false;
    }
    if (f.size > MAX_BYTES) {
      setError(`Part 2 file too large: ${fmtFileSize(f.size)} exceeds the 100 MB limit`);
      setAudioPart2(null);
      return false;
    }
    setError(null);
    setAudioPart2(f);
    return true;
  }

  function onFileChangePart2(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!acceptFilePart2(f)) e.target.value = "";
  }

  function onDrop2(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag2(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    acceptFilePart2(f);
  }

  function firstMissing(): string | null {
    if (!prospect.trim()) return "Prospect is required";
    if (!consultationDate) return "Consultation date is required";
    if (!outcome) return "Outcome is required";
    if (!file) return "Audio file is required";
    if (recordingType === "split" && !audioPart2)
      return "Part 2 audio is required for split uploads";
    return null;
  }

  // PUT a file to a presigned R2 URL with upload progress. Resolves on
  // 2xx; rejects with a typed Error on non-2xx / network / abort. Kept
  // in XHR (not fetch) because the fetch API has no upload-progress
  // event; we still want the user to see bytes moving.
  function putWithProgress(
    url: string,
    blob: File,
    onLoaded: (loaded: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) onLoaded(ev.loaded);
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onLoaded(blob.size);
          resolve();
        } else {
          reject(
            new Error(
              `R2 upload failed: HTTP ${xhr.status} ${xhr.statusText || ""}`.trim(),
            ),
          );
        }
      });
      xhr.addEventListener("error", () =>
        reject(new Error("Network error during R2 upload")),
      );
      xhr.addEventListener("abort", () =>
        reject(new Error("Upload was aborted")),
      );
      xhr.send(blob);
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const reason = firstMissing();
    if (reason) {
      setError(reason);
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      // Step 1 — presign: send metadata only, get back the uploadId and
      // one or two R2 PUT URLs.
      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospect: prospect.trim(),
          consultation_date: consultationDate,
          outcome,
          recordingType,
          filename: file!.name,
          filesize: file!.size,
          filename_part2: audioPart2?.name ?? null,
          filesize_part2: audioPart2?.size ?? null,
        }),
      });
      if (!presignRes.ok) {
        let msg = `Presign failed: HTTP ${presignRes.status}`;
        try {
          const body = (await presignRes.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch {}
        throw new Error(msg);
      }
      const { uploadId, putUrl, putUrlPart2 } = (await presignRes.json()) as {
        uploadId: string;
        putUrl: string;
        putUrlPart2: string | null;
      };

      // Step 2 — PUT audio bytes straight to R2. For split, do both
      // halves sequentially and aggregate progress.
      const totalBytes = file!.size + (audioPart2?.size ?? 0);
      let loaded1 = 0;
      let loaded2 = 0;
      const updateProgress = () => {
        setProgress(
          Math.round(((loaded1 + loaded2) / Math.max(1, totalBytes)) * 100),
        );
      };

      await putWithProgress(putUrl, file!, (loaded) => {
        loaded1 = loaded;
        updateProgress();
      });

      if (recordingType === "split" && audioPart2 && putUrlPart2) {
        await putWithProgress(putUrlPart2, audioPart2, (loaded) => {
          loaded2 = loaded;
          updateProgress();
        });
      }

      // Step 3 — confirm: flip status from pending_upload to uploaded
      // and trigger the transcribe pipeline server-side.
      const confirmRes = await fetch("/api/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      if (!confirmRes.ok) {
        let msg = `Confirm failed: HTTP ${confirmRes.status}`;
        try {
          const body = (await confirmRes.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch {}
        throw new Error(msg);
      }

      router.push(`/status/${uploadId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setUploading(false);
    }
  }

  const valid = !firstMissing();

  return (
    <form onSubmit={onSubmit}>
      <div className="card card-pad-lg">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}
        >
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label className="label" htmlFor="prospect">
              Prospect name <span className="req">*</span>
            </label>
            <input
              id="prospect"
              type="text"
              className="input"
              placeholder="e.g. Aisha Brennan"
              value={prospect}
              onChange={(e) => setProspect(e.target.value)}
              autoComplete="off"
              autoCapitalize="words"
              disabled={uploading}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="consultation_date">
              Consultation date <span className="req">*</span>
            </label>
            <input
              id="consultation_date"
              type="date"
              className="input"
              value={consultationDate}
              onChange={(e) => setConsultationDate(e.target.value)}
              max={todayIso()}
              disabled={uploading}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="outcome">
              Outcome <span className="req">*</span>
            </label>
            <select
              id="outcome"
              className="select"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              disabled={uploading}
            >
              <option value="" disabled>
                Select outcome…
              </option>
              {OUTCOME_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label className="label" htmlFor="recording-type">
              Recording Type <span className="req">*</span>
            </label>
            <select
              id="recording-type"
              className="select"
              value={recordingType}
              onChange={(e) =>
                setRecordingType(e.target.value as RecordingTypeOption)
              }
              disabled={uploading}
            >
              {RECORDING_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label className="label">
              Audio file <span className="req">*</span>
              <span className="hint">
                .mp3 · .m4a · .wav · .ogg · .aac · .flac — up to 100 MB
              </span>
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!uploading) setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                if (uploading) return;
                onDrop(e);
              }}
              onClick={() => {
                if (!uploading) fileRef.current?.click();
              }}
              style={{
                border: `1.5px dashed ${drag ? "var(--primary)" : "var(--border-strong)"}`,
                background: drag
                  ? "var(--primary-50)"
                  : "var(--surface-2)",
                borderRadius: "var(--r-md)",
                padding: 24,
                display: "flex",
                alignItems: "center",
                gap: 16,
                cursor: uploading ? "not-allowed" : "pointer",
                transition: "background 100ms, border-color 100ms",
                opacity: uploading ? 0.7 : 1,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: file ? "var(--score-green-bg)" : "var(--primary-50)",
                  color: file ? "var(--score-green)" : "var(--primary)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                {file ? <CheckCirc size={22} /> : <Mic size={22} />}
              </div>
              {file ? (
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {file.name}
                  </div>
                  <div className="muted mono" style={{ fontSize: 12 }}>
                    {fmtFileSize(file.size)} · ready to upload
                  </div>
                </div>
              ) : (
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    Drop audio file here, or click to browse
                  </div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    Whole consultation, from greeting through close
                  </div>
                </div>
              )}
              {file ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  disabled={uploading}
                >
                  <X size={14} /> Remove
                </button>
              ) : (
                <span className="kbd">browse</span>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".mp3,.m4a,.wav,.ogg,.aac,.flac,audio/*"
                hidden
                onChange={onFileChange}
                disabled={uploading}
              />
            </div>
          </div>

          {recordingType === "split" && (
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label className="label">
                Part 2 Audio <span className="req">*</span>
                <span className="hint">
                  Same formats — up to 100 MB
                </span>
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!uploading) setDrag2(true);
                }}
                onDragLeave={() => setDrag2(false)}
                onDrop={(e) => {
                  if (uploading) return;
                  onDrop2(e);
                }}
                onClick={() => {
                  if (!uploading) fileRef2.current?.click();
                }}
                style={{
                  border: `1.5px dashed ${drag2 ? "var(--primary)" : "var(--border-strong)"}`,
                  background: drag2
                    ? "var(--primary-50)"
                    : "var(--surface-2)",
                  borderRadius: "var(--r-md)",
                  padding: 24,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  cursor: uploading ? "not-allowed" : "pointer",
                  transition: "background 100ms, border-color 100ms",
                  opacity: uploading ? 0.7 : 1,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: audioPart2
                      ? "var(--score-green-bg)"
                      : "var(--primary-50)",
                    color: audioPart2
                      ? "var(--score-green)"
                      : "var(--primary)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  {audioPart2 ? <CheckCirc size={22} /> : <Mic size={22} />}
                </div>
                {audioPart2 ? (
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {audioPart2.name}
                    </div>
                    <div className="muted mono" style={{ fontSize: 12 }}>
                      {fmtFileSize(audioPart2.size)} · part 2 ready
                    </div>
                  </div>
                ) : (
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>
                      Drop part 2 here, or click to browse
                    </div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      Second half of the consultation
                    </div>
                  </div>
                )}
                {audioPart2 ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAudioPart2(null);
                      if (fileRef2.current) fileRef2.current.value = "";
                    }}
                    disabled={uploading}
                  >
                    <X size={14} /> Remove
                  </button>
                ) : (
                  <span className="kbd">browse</span>
                )}
                <input
                  ref={fileRef2}
                  type="file"
                  accept=".mp3,.m4a,.wav,.ogg,.aac,.flac,audio/*"
                  hidden
                  onChange={onFileChangePart2}
                  disabled={uploading}
                />
              </div>
            </div>
          )}
        </div>

        {uploading && (
          <div style={{ marginTop: 18 }}>
            <div
              className="mono"
              style={{
                fontSize: 12,
                color: "var(--ink-3)",
                marginBottom: 6,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Uploading…</span>
              <span>{progress}%</span>
            </div>
            <div
              style={{
                width: "100%",
                height: 6,
                background: "var(--surface-sunken)",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: "var(--primary)",
                  transition: "width 120ms linear",
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 16,
              padding: "10px 12px",
              background: "var(--score-red-bg)",
              color: "var(--score-red)",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 500,
              whiteSpace: "pre-wrap",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 22,
            paddingTop: 18,
            borderTop: "1px solid var(--divider)",
          }}
        >
          <div
            className="muted"
            style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 8 }}
          >
            <Help size={14} /> Outcome is logged before analysis so the model
            doesn&rsquo;t see it.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.push("/dashboard")}
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!valid || uploading}
            >
              <UploadIcon size={15} /> {uploading ? "Uploading…" : "Upload & analyze"}
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 28,
          color: "var(--ink-3)",
          fontSize: 12.5,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Clock size={13} /> Typical turnaround: 3–5 min
        </span>
        <span
          style={{ width: 1, height: 12, background: "var(--border-strong)" }}
        />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Doc size={13} /> Files &gt; 25MB are auto-chunked via ffmpeg
        </span>
      </div>
    </form>
  );
}
