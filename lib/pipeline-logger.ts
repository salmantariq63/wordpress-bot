import type { PipelineLogEntry, PipelineLogLevel, PipelinePhase } from "@/lib/pipeline-types";

export type LogSink = (entry: PipelineLogEntry) => void;

export function createPipelineLogger(onLog: LogSink) {
  const log = (
    level: PipelineLogLevel,
    message: string,
    options?: { phase?: PipelinePhase; pageTitle?: string; pageId?: number }
  ) => {
    onLog({
      timestamp: new Date().toISOString(),
      level,
      message,
      phase: options?.phase,
      pageTitle: options?.pageTitle,
      pageId: options?.pageId,
    });
  };

  return {
    info: (message: string, options?: { phase?: PipelinePhase; pageTitle?: string; pageId?: number }) =>
      log("info", message, options),
    warn: (message: string, options?: { phase?: PipelinePhase; pageTitle?: string; pageId?: number }) =>
      log("warn", message, options),
    error: (message: string, options?: { phase?: PipelinePhase; pageTitle?: string; pageId?: number }) =>
      log("error", message, options),
  };
}
