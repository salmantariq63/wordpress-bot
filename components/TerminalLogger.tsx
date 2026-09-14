"use client";

import { Eraser, Terminal } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { PipelineLogEntry } from "@/lib/pipeline-types";

export type TerminalPipelineStatus = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED";

export type LogMessage = PipelineLogEntry;

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function phaseTag(entry: LogMessage): string {
  if (entry.level === "error") return "[ERROR]";
  if (entry.phase === "complete") return "[SUCCESS]";
  if (entry.phase === "phase1") return "[PHASE 1]";
  if (entry.phase === "phase2") return "[PHASE 2]";
  if (entry.phase === "phase3") return "[PHASE 3]";
  if (entry.phase === "setup") return "[SETUP]";
  if (entry.level === "warn") return "[WARN]";
  return "[INFO]";
}

function tagColorClass(entry: LogMessage): string {
  if (entry.level === "error") return "text-red-400";
  if (entry.phase === "complete") return "text-emerald-400";
  if (entry.phase === "phase1") return "text-cyan-400";
  if (entry.phase === "phase2") return "text-sky-400";
  if (entry.phase === "phase3") return "text-violet-400";
  if (entry.level === "warn") return "text-amber-300";
  return "text-teal-300";
}

function statusBadgeClass(status: TerminalPipelineStatus): string {
  switch (status) {
    case "RUNNING":
      return "bg-blue-500/20 text-blue-300 ring-blue-500/40";
    case "COMPLETED":
      return "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40";
    case "FAILED":
      return "bg-red-500/20 text-red-300 ring-red-500/40";
    default:
      return "bg-slate-500/20 text-slate-300 ring-slate-500/40";
  }
}

type TerminalLoggerProps = {
  logs: LogMessage[];
  status: TerminalPipelineStatus;
  onClear: () => void;
  className?: string;
};

export function TerminalLogger({
  logs,
  status,
  onClear,
  className = "",
}: TerminalLoggerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs]);

  const emptyMessage = useMemo(() => {
    if (status === "RUNNING") return "Waiting for pipeline events…";
    return "No pipeline logs yet. Launch automation to stream live output here.";
  }, [status]);

  return (
    <section
      className={`overflow-hidden rounded-xl border border-slate-800 bg-gray-950 shadow-lg ${className}`}
      aria-label="Pipeline terminal log"
    >
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-red-500/90" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/90" />
            <span className="h-3 w-3 rounded-full bg-green-500/90" />
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <Terminal className="h-4 w-4 text-cyan-400" />
            <span className="font-mono text-xs font-medium tracking-wide">
              pipeline.log
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${statusBadgeClass(status)}`}
          >
            {status}
          </span>
          <button
            type="button"
            onClick={onClear}
            disabled={logs.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 font-mono text-[11px] text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear Logs
          </button>
        </div>
      </div>

      <div className="max-h-80 min-h-[12rem] overflow-y-auto px-4 py-3 font-mono text-sm leading-relaxed text-emerald-400/90">
        {logs.length === 0 ? (
          <p className="text-slate-500">{emptyMessage}</p>
        ) : (
          <ul className="space-y-1">
            {logs.map((entry, index) => (
              <li key={`${entry.timestamp}-${index}`} className="flex flex-wrap gap-x-2">
                <span className="shrink-0 text-slate-500">
                  {formatTime(entry.timestamp)}
                </span>
                <span className={`shrink-0 font-semibold ${tagColorClass(entry)}`}>
                  {phaseTag(entry)}
                </span>
                <span className="text-cyan-100/90">
                  {entry.message}
                  {entry.pageTitle ? (
                    <span className="text-slate-400"> — {entry.pageTitle}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}

export function parsePipelineSsePayload(
  payload: string
):
  | { kind: "log"; entry: LogMessage }
  | { kind: "done" }
  | { kind: "error"; message: string }
  | null {
  try {
    const event = JSON.parse(payload) as
      | LogMessage
      | { type: "done" }
      | { type: "error"; message: string };

    if ("type" in event && event.type === "done") {
      return { kind: "done" };
    }
    if ("type" in event && event.type === "error") {
      return { kind: "error", message: event.message };
    }
    if ("message" in event && "timestamp" in event) {
      return { kind: "log", entry: event as LogMessage };
    }
  } catch {
    return null;
  }
  return null;
}
