import { NextRequest, NextResponse } from "next/server";
import { getRoundResults } from "@/lib/usac-api";
import { isRateLimited } from "@/lib/rate-limit";

/**
 * GET /api/competitions/[eventId]/[roundId]
 * Proxies round results from USA Climbing.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; roundId: string }> }
) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`api:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { roundId } = await params;

  if (isNaN(Number(roundId))) {
    return NextResponse.json({ error: "Invalid roundId" }, { status: 400 });
  }

  try {
    const data = await getRoundResults(Number(roundId));
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
