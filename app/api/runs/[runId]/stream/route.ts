import { getDb } from "@/lib/db";
import { formatRunSSE } from "@/lib/run-events";
import { readJournalAfter } from "@/lib/run-journal";

/**
 * GET /api/runs/[runId]/stream?after_seq=<n> — data-only SSE.
 *
 * Q1/N1 reconnect contract (hermes): first REPLAY every journaled event with
 * seq > after_seq (default -1 = from the start), THEN tail the journal for new
 * events until a `terminal` envelope or the client aborts. Replay is
 * at-least-once; the client (RunView) dedupes by `seq`. The journal is the
 * source of truth — this route only reads/tails it (single writer = the
 * engine, Q2). A 250ms poll of readJournalAfter is the simple, robust v1
 * (revisit with an in-process emitter if P2 adds concurrent consumers).
 *
 * Truncated final JSONL line after a crash is tolerated by readJournalAfter
 * (skips, never throws). SSE format + headers mirror /api/chat verbatim.
 */

export const dynamic = "force-dynamic";

const RUN_ID_RE = /^run_\d+_[0-9a-f]+$/;
const POLL_MS = 250;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await ctx.params;
  if (!RUN_ID_RE.test(runId)) {
    return new Response("invalid run id", { status: 400 });
  }
  const exists = getDb().prepare("SELECT 1 FROM runs WHERE run_id = ?").get(runId);
  if (!exists) {
    return new Response(`run not found: ${runId}`, { status: 404 });
  }

  const url = new URL(req.url);
  const rawAfter = url.searchParams.get("after_seq");
  let afterSeq = rawAfter == null ? -1 : Number.parseInt(rawAfter, 10);
  if (Number.isNaN(afterSeq)) afterSeq = -1;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastSeq = afterSeq;
      let done = false;
      const flush = (): void => {
        // Read strictly above the last seq sent — never miss the gap between
        // the replayed slice and the live tail (hermes at-least-once).
        for (const ev of readJournalAfter(runId, lastSeq)) {
          controller.enqueue(encoder.encode(formatRunSSE(ev)));
          if (ev.seq > lastSeq) lastSeq = ev.seq;
          if (ev.terminal) done = true;
        }
      };
      try {
        flush(); // initial replay (?after_seq= window)
        while (!done && !req.signal.aborted) {
          await sleep(POLL_MS, req.signal);
          if (req.signal.aborted) break;
          flush();
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            formatRunSSE({
              run_id: runId,
              seq: -1,
              ts: Date.now(),
              terminal: true,
              kind: "error",
              message: err instanceof Error ? err.message : String(err),
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
