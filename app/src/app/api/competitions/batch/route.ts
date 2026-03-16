import { NextRequest, NextResponse } from "next/server";
import { getRoundResults } from "@/lib/usac-api";
import { isRateLimited } from "@/lib/rate-limit";

/**
 * GET /api/competitions/batch?rounds=1234,5678,...
 * Fetches multiple rounds in parallel, returns { [roundId]: results }.
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`api:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const roundsParam = request.nextUrl.searchParams.get("rounds") ?? "";
  const roundIds = roundsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !isNaN(n) && n > 0);

  if (roundIds.length === 0) {
    return NextResponse.json({ error: "No valid round IDs" }, { status: 400 });
  }

  if (roundIds.length > 20) {
    return NextResponse.json({ error: "Too many rounds (max 20)" }, { status: 400 });
  }

  const results: Record<string, unknown> = {};
  await Promise.all(
    roundIds.map(async (id) => {
      try {
        results[id] = await getRoundResults(id);
      } catch {
        results[id] = null;
      }
    })
  );

  return NextResponse.json(results);
}
