import { NextResponse } from "next/server";
import { getRoundResults } from "@/lib/usac-api";

/**
 * GET /api/competitions/[eventId]/[roundId]
 * Proxies round results from USA Climbing.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string; roundId: string }> }
) {
  const { roundId } = await params;

  try {
    const data = await getRoundResults(Number(roundId));
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
