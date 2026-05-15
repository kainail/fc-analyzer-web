"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OUTCOME_GROUPS } from "@/lib/outcomes";

type Props = {
  reps: string[];
  gyms: string[];
};

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXT = ["mp3", "m4a", "wav", "ogg", "aac", "flac"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function UploadForm({ reps, gyms }: Props) {
  const router = useRouter();

  const [rep, setRep] = useState("");
  const [gym, setGym] = useState(gyms[0] ?? "");
  const [prospect, setProspect] = useState("");
  const [consultationDate, setConsultationDate] = useState(todayIso());
  const [outcome, setOutcome] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXT.includes(ext)) {
      setError(
        `Audio must be one of: ${ALLOWED_EXT.join(", ")} (got "${f.name}")`,
      );
      setFile(null);
      e.target.value = "";
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(
        `File too large: ${formatBytes(f.size)} exceeds the 100 MB limit`,
      );
      setFile(null);
      e.target.value = "";
      return;
    }
    setError(null);
    setFile(f);
  }

  function firstMissing(): string | null {
    if (!rep) return "Rep is required";
    if (!gym) return "Gym is required";
    if (!prospect.trim()) return "Prospect is required";
    if (!consultationDate) return "Consultation date is required";
    if (!outcome) return "Outcome is required";
    if (!file) return "Audio file is required";
    return null;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const reason = firstMissing();
    if (reason) {
      setError(reason);
      return;
    }

    const fd = new FormData();
    fd.append("rep", rep);
    fd.append("gym", gym);
    fd.append("prospect", prospect.trim());
    fd.append("consultation_date", consultationDate);
    fd.append("outcome", outcome);
    fd.append("audio", file!);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    xhr.upload.addEventListener("progress", (ev) => {
      if (ev.lengthComputable) {
        setProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText) as { upload_id: string };
          router.push(`/status/${res.upload_id}`);
        } catch {
          setError("Server returned an invalid response");
        }
      } else {
        let message = `HTTP ${xhr.status}`;
        try {
          const res = JSON.parse(xhr.responseText) as { error?: string };
          if (res.error) message = res.error;
        } catch {}
        setError(message);
      }
    });

    xhr.addEventListener("error", () => {
      setUploading(false);
      setError("Network error during upload");
    });

    xhr.addEventListener("abort", () => {
      setUploading(false);
      setError("Upload was aborted");
    });

    setUploading(true);
    setProgress(0);
    xhr.send(fd);
  }

  const inputCls =
    "w-full border rounded-lg px-3 py-3 text-base bg-white dark:bg-zinc-900";
  const labelCls = "block text-sm font-medium mb-1";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="rep">
          Rep
        </label>
        <select
          id="rep"
          className={inputCls}
          value={rep}
          onChange={(e) => setRep(e.target.value)}
          disabled={uploading}
        >
          <option value="">Select rep…</option>
          {reps.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls} htmlFor="gym">
          Gym
        </label>
        <select
          id="gym"
          className={inputCls}
          value={gym}
          onChange={(e) => setGym(e.target.value)}
          disabled={uploading}
        >
          {gyms.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls} htmlFor="prospect">
          Prospect name
        </label>
        <input
          id="prospect"
          type="text"
          className={inputCls}
          value={prospect}
          onChange={(e) => setProspect(e.target.value)}
          autoComplete="off"
          autoCapitalize="words"
          disabled={uploading}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor="consultation_date">
          Consultation date
        </label>
        <input
          id="consultation_date"
          type="date"
          className={inputCls}
          value={consultationDate}
          onChange={(e) => setConsultationDate(e.target.value)}
          disabled={uploading}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor="outcome">
          Outcome
        </label>
        <select
          id="outcome"
          className={inputCls}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          disabled={uploading}
        >
          <option value="">Select outcome…</option>
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

      <div>
        <label className={labelCls} htmlFor="audio">
          Audio recording
        </label>
        <input
          id="audio"
          type="file"
          accept=".mp3,.m4a,.wav,.ogg,.aac,.flac,audio/*"
          onChange={onFileChange}
          className="block w-full text-sm py-2"
          disabled={uploading}
        />
        {file && (
          <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Selected:{" "}
            <span className="font-mono break-all">{file.name}</span> (
            {formatBytes(file.size)})
          </div>
        )}
      </div>

      {uploading && (
        <div className="space-y-1">
          <div className="text-sm">Uploading… {progress}%</div>
          <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-800 rounded overflow-hidden">
            <div
              className="h-3 bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="border-2 border-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg p-4"
        >
          <div className="font-semibold text-red-700 dark:text-red-300">
            Error
          </div>
          <pre className="whitespace-pre-wrap text-sm text-red-900 dark:text-red-200">
            {error}
          </pre>
        </div>
      )}

      <button
        type="submit"
        disabled={uploading}
        className="w-full px-4 py-4 bg-blue-600 text-white text-base font-semibold rounded-lg disabled:opacity-50 active:bg-blue-700"
      >
        {uploading ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
