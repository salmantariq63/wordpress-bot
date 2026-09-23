import type { PipelineLogEntry } from "@/lib/pipeline-types";

export type SseEvent =
  | PipelineLogEntry
  | { type: "done" }
  | { type: "error"; message: string };

function sseEncode(entry: SseEvent): string {
  return `data: ${JSON.stringify(entry)}\n\n`;
}

/**
 * Shared SSE wrapper used by Phase 1–3, Phase 4, and Phase 5 pipeline routes.
 */
export function createPipelineSseResponse(
  run: (onLog: (entry: PipelineLogEntry) => void) => Promise<void>
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();

      const push = (entry: SseEvent) => {
        controller.enqueue(encoder.encode(sseEncode(entry)));
      };

      const onLog = (entry: PipelineLogEntry) => {
        push(entry);
      };

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      (async () => {
        try {
          await run(onLog);
          push({ type: "done" });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Pipeline execution failed.";
          push({ type: "error", message });
        } finally {
          clearInterval(heartbeat);
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
