import { NextRequest } from "next/server";
import { getRoundResults, USACRankedAthlete } from "@/lib/usac-api";
import { diffResults, ResultSnapshot } from "@/lib/diff";

/**
 * GET /api/events?roundId=11515
 * Server-Sent Events endpoint.
 * Polls USA Climbing every 30s and emits diffs.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const roundId = searchParams.get("roundId");

  if (!roundId) {
    return new Response("roundId is required", { status: 400 });
  }

  const encoder = new TextEncoder();
  let previousResults: ResultSnapshot[] = [];
  let running = true;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const poll = async () => {
        try {
          const result = await getRoundResults(Number(roundId));
          send("results", result);

          // Compute diffs
          const current: ResultSnapshot[] = result.ranking.map(
            (a: USACRankedAthlete) => ({
              climberId: String(a.athlete_id),
              climberName: a.name,
              rank: a.rank,
              scores: { score: a.score },
            })
          );

          const changes = diffResults(previousResults, current);
          if (changes.length > 0) {
            send("changes", changes);
          }
          previousResults = current;
        } catch (err) {
          send("error", {
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      };

      await poll();

      const interval = setInterval(async () => {
        if (!running) {
          clearInterval(interval);
          return;
        }
        await poll();
      }, 30000);

      request.signal.addEventListener("abort", () => {
        running = false;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
