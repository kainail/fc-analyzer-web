"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FFMPEG_MISSING_ERROR_MESSAGE } from "@/lib/transcribe-constants";
import { fmtDate, fmtFileSize } from "@/lib/format";
import {
  ArrowL,
  ArrowR,
  Check,
  Sparkle,
  Spin,
  Dot,
} from "@/lib/icons";

export type Metadata = {
  upload_id: string;
  rep: string;
  gym: string;
  prospect: string;
  consultation_date: string;
  outcome: string;
  audio_filename: string;
  audio_size_bytes: number;
  uploaded_at: string;
  status: string;
  transcribed_at?: string;
  analyzed_at?: string;
  json_parse_error?: string;
  error_message?: string;
  error_at?: string;
  chunk_count?: number;
};

const FFMPEG_MISSING_USER_MESSAGE =
  "This recording is larger than 25MB and needs to be split into chunks, but ffmpeg isn't installed on the server. Install ffmpeg (and make sure it's on PATH) to enable chunked transcription.";

const TERMINAL_STATUSES = new Set([
  "analyzed",
  "error_transcription",
  "error_analysis",
]);

const POLL_INTERVAL_MS = 3000;
const MAX_CONSECUTIVE_FAILURES = 5;

type StageState = "done" | "active" | "pending" | "error";

type PipelineStage = {
  id: "uploaded" | "transcribing" | "analyzing" | "analyzed";
  label: string;
  sub: string;
};

const STAGES: PipelineStage[] = [
  { id: "uploaded", label: "Uploaded", sub: "Audio received" },
  {
    id: "transcribing",
    label: "Transcribing",
    sub: "Speech → text via Whisper",
  },
  {
    id: "analyzing",
    label: "Analyzing",
    sub: "Stage scoring, dimensions, flags",
  },
  { id: "analyzed", label: "Analyzed", sub: "Coaching report ready" },
];

// Map current metadata.status onto the four-stage pipeline.
// Returns: { activeIdx, errorIdx | null }
function pipelinePosition(status: string): {
  activeIdx: number;
  errorIdx: number | null;
} {
  switch (status) {
    case "uploaded":
      return { activeIdx: 0, errorIdx: null };
    case "chunking":
    case "transcribing":
      return { activeIdx: 1, errorIdx: null };
    case "transcribed":
      // Transcription done, analyzer hasn't started writing yet.
      return { activeIdx: 2, errorIdx: null };
    case "analyzing":
      return { activeIdx: 2, errorIdx: null };
    case "analyzed":
      return { activeIdx: 3, errorIdx: null };
    case "error_transcription":
      return { activeIdx: 1, errorIdx: 1 };
    case "error_analysis":
      return { activeIdx: 2, errorIdx: 2 };
    default:
      return { activeIdx: 0, errorIdx: null };
  }
}

function MetaCell({
  label,
  value,
  sub,
  mono,
  border = true,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  mono?: boolean;
  border?: boolean;
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRight: border ? "1px solid var(--divider)" : "none",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: "var(--ink-4)",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        className={mono ? "mono" : ""}
        style={{
          fontSize: 13,
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function PipeNode({ state }: { state: StageState }) {
  if (state === "done") {
    return (
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: "var(--primary)",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 0 0 4px var(--primary-50)",
        }}
      >
        <Check size={13} stroke={2.4} />
      </div>
    );
  }
  if (state === "active") {
    return (
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: "var(--surface)",
          color: "var(--primary)",
          border: "2px solid var(--primary)",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 0 0 4px var(--primary-50)",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: "var(--primary)",
            animation: "pulse 1.4s ease-in-out infinite",
          }}
        />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: "var(--score-red)",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 0 0 4px var(--score-red-bg)",
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        !
      </div>
    );
  }
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 999,
        background: "var(--surface)",
        border: "1.5px solid var(--border-strong)",
      }}
    />
  );
}

function StateBadge({ state }: { state: StageState }) {
  if (state === "done")
    return (
      <span className="mono" style={{ fontSize: 11, color: "var(--score-green)" }}>
        DONE
      </span>
    );
  if (state === "active")
    return (
      <span
        className="mono"
        style={{
          fontSize: 11,
          color: "var(--primary)",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <Spin size={11} style={{ animation: "spin 1s linear infinite" }} />
        WORKING
      </span>
    );
  if (state === "error")
    return (
      <span className="mono" style={{ fontSize: 11, color: "var(--score-red)" }}>
        FAILED
      </span>
    );
  return (
    <span className="mono faint" style={{ fontSize: 11 }}>
      QUEUED
    </span>
  );
}

function Skeleton() {
  return (
    <div
      style={{
        marginTop: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            height: 8,
            borderRadius: 4,
            width: i === 1 ? "60%" : "100%",
            background:
              "linear-gradient(90deg, var(--surface-sunken) 0%, var(--divider) 50%, var(--surface-sunken) 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.4s linear infinite",
          }}
        />
      ))}
    </div>
  );
}

function AnalyzingPreview() {
  const items = [
    "Stage scoring",
    "Dimensions",
    "Diagnostic flags",
    "Drill focus",
  ];
  return (
    <div
      style={{
        marginTop: 10,
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 6,
      }}
    >
      {items.map((it) => (
        <div
          key={it}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 12,
            color: "var(--ink-3)",
          }}
        >
          <Dot size={12} style={{ color: "var(--ink-5)" }} />
          {it}
        </div>
      ))}
    </div>
  );
}

export default function StatusView({ initial }: { initial: Metadata }) {
  const [metadata, setMetadata] = useState<Metadata>(initial);
  const [connectionLost, setConnectionLost] = useState(false);
  const failuresRef = useRef(0);

  const isTerminal = TERMINAL_STATUSES.has(metadata.status);
  const isError =
    metadata.status === "error_transcription" ||
    metadata.status === "error_analysis";
  const isFfmpegMissing =
    metadata.status === "error_transcription" &&
    metadata.error_message === FFMPEG_MISSING_ERROR_MESSAGE;
  const polling = !isTerminal && !connectionLost;
  const done = metadata.status === "analyzed";

  useEffect(() => {
    if (isTerminal || connectionLost) return;

    let cancelled = false;
    const uploadId = initial.upload_id;

    const tick = async () => {
      try {
        const res = await fetch(`/api/status/${encodeURIComponent(uploadId)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Metadata;
        if (cancelled) return;
        failuresRef.current = 0;
        setMetadata(data);
      } catch {
        if (cancelled) return;
        failuresRef.current += 1;
        if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
          setConnectionLost(true);
        }
      }
    };

    const handle = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [isTerminal, connectionLost, initial.upload_id]);

  const { activeIdx, errorIdx } = pipelinePosition(metadata.status);

  // Override the transcribing sub-label when chunking is happening, so the
  // user sees what's actually going on.
  const stages: PipelineStage[] = STAGES.map((s) => {
    if (s.id === "transcribing" && metadata.status === "chunking") {
      return { ...s, sub: "Splitting audio into chunks…" };
    }
    if (
      s.id === "transcribing" &&
      metadata.chunk_count &&
      metadata.status === "transcribing"
    ) {
      return {
        ...s,
        sub: `Speech → text via Whisper · ${metadata.chunk_count} chunks`,
      };
    }
    return s;
  });

  return (
    <div className="content narrow">
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--ink-3)",
              fontSize: 12.5,
              marginBottom: 4,
            }}
          >
            <Link
              href="/dashboard"
              className="btn btn-ghost btn-sm"
              style={{ height: 22, padding: "0 6px", marginLeft: -6 }}
            >
              <ArrowL size={13} /> Dashboard
            </Link>
            <span className="mono" style={{ color: "var(--ink-4)" }}>
              · {metadata.upload_id}
            </span>
          </div>
          <h2>{metadata.prospect}</h2>
          <div className="sub">
            Consultation uploaded{" "}
            {new Date(metadata.uploaded_at).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
            {polling && (
              <>
                <span style={{ margin: "0 6px" }}>·</span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: "var(--score-green)",
                      animation: "pulse 1.4s ease-in-out infinite",
                    }}
                  />
                  Live
                </span>
              </>
            )}
          </div>
        </div>
        {done && (
          <Link
            className="btn btn-primary"
            href={`/analysis/${encodeURIComponent(metadata.upload_id)}`}
          >
            View analysis <ArrowR size={15} />
          </Link>
        )}
      </div>

      {/* Metadata strip */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 0,
          }}
        >
          <MetaCell label="Rep" value={metadata.rep} />
          <MetaCell label="Gym" value={metadata.gym} />
          <MetaCell
            label="Outcome"
            value={
              <span className="chip chip-neutral">
                <span className="dot" />
                {metadata.outcome}
              </span>
            }
            border={false}
          />
          <MetaCell
            label="Date"
            value={fmtDate(metadata.consultation_date)}
            mono
          />
          <MetaCell
            label="File"
            value={metadata.audio_filename}
            sub={fmtFileSize(metadata.audio_size_bytes)}
            mono
          />
          <MetaCell
            label="Status"
            value={<span className="mono">{metadata.status}</span>}
            border={false}
          />
        </div>
      </div>

      {/* Pipeline */}
      <div className="card card-pad-lg">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            Processing pipeline
          </h3>
          <div className="mono muted" style={{ fontSize: 12 }}>
            {done
              ? "Complete"
              : errorIdx != null
                ? "Failed"
                : `Step ${activeIdx + 1} of ${stages.length}`}
          </div>
        </div>

        <div style={{ position: "relative", display: "grid", gap: 0 }}>
          {stages.map((s, i) => {
            let state: StageState;
            if (errorIdx === i) state = "error";
            else if (i < activeIdx) state = "done";
            else if (i === activeIdx) state = done ? "done" : "active";
            else state = "pending";

            const last = i === stages.length - 1;
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  gap: 16,
                  position: "relative",
                  paddingBottom: last ? 0 : 18,
                }}
              >
                {/* Rail */}
                <div
                  style={{
                    position: "relative",
                    width: 24,
                    flexShrink: 0,
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <PipeNode state={state} />
                  {!last && (
                    <div
                      style={{
                        position: "absolute",
                        top: 24,
                        bottom: -8,
                        left: "50%",
                        width: 2,
                        marginLeft: -1,
                        background:
                          i < activeIdx ? "var(--primary)" : "var(--border)",
                        overflow: "hidden",
                      }}
                    />
                  )}
                </div>

                {/* Body */}
                <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: state === "active" ? 600 : 500,
                        color:
                          state === "pending" ? "var(--ink-4)" : "var(--ink)",
                        fontSize: 14,
                      }}
                    >
                      {s.label}
                    </div>
                    <StateBadge state={state} />
                  </div>
                  <div
                    style={{
                      color: "var(--ink-3)",
                      fontSize: 12.5,
                      marginTop: 2,
                    }}
                  >
                    {s.sub}
                  </div>

                  {state === "active" && s.id === "transcribing" && <Skeleton />}
                  {state === "active" && s.id === "analyzing" && (
                    <AnalyzingPreview />
                  )}
                  {state === "done" &&
                    s.id === "transcribing" &&
                    metadata.transcribed_at && (
                      <div
                        className="muted mono"
                        style={{ fontSize: 12, marginTop: 6 }}
                      >
                        Finished{" "}
                        {new Date(metadata.transcribed_at).toLocaleTimeString(
                          [],
                          { hour: "numeric", minute: "2-digit" },
                        )}
                      </div>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {connectionLost && (
        <div
          className="muted"
          style={{
            fontSize: 12.5,
            marginTop: 14,
          }}
        >
          Connection lost — refresh to retry.
        </div>
      )}

      {!isTerminal && !connectionLost && (
        <div
          className="muted"
          style={{
            fontSize: 12.5,
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Spin size={13} style={{ animation: "spin 1s linear infinite" }} />
          You can leave this page — the report will be waiting on the dashboard.
        </div>
      )}

      {isError && (
        <div
          style={{
            marginTop: 14,
            padding: "14px 16px",
            border: "1px solid var(--score-red)",
            background: "var(--score-red-bg)",
            borderRadius: "var(--r-md)",
            color: "var(--score-red)",
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {metadata.status === "error_transcription"
              ? "Transcription failed"
              : "Analysis failed"}
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>
            {isFfmpegMissing
              ? FFMPEG_MISSING_USER_MESSAGE
              : (metadata.error_message ?? "See server logs for details.")}
          </div>
        </div>
      )}

      {done && (
        <div
          className="card card-pad status-complete"
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "var(--primary)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Sparkle size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>
              Coaching report ready
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Overall score, stage breakdown, and primary drill focus are all
              set.
              {metadata.json_parse_error && (
                <span
                  style={{
                    color: "var(--score-amber)",
                    marginLeft: 6,
                    fontWeight: 500,
                  }}
                >
                  · output partially malformed
                </span>
              )}
            </div>
          </div>
          <Link
            className="btn btn-primary"
            href={`/analysis/${encodeURIComponent(metadata.upload_id)}`}
          >
            View analysis <ArrowR size={15} />
          </Link>
        </div>
      )}
    </div>
  );
}
