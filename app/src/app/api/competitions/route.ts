import { NextRequest, NextResponse } from "next/server";
import {
  getSeasons,
  getLiveEvents,
  getEvent,
  getSeasonEvents,
} from "@/lib/usac-api";
import { isRateLimited } from "@/lib/rate-limit";

/**
 * GET /api/competitions
 *   ?eventId=475         → event detail
 *   ?seasonId=5          → events for a season
 *   ?live=true           → live events
 *   (no params)          → seasons list
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`api:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);

  try {
    const eventId = searchParams.get("eventId");
    if (eventId) {
      if (isNaN(Number(eventId))) {
        return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
      }
      const data = await getEvent(Number(eventId));
      return NextResponse.json(data);
    }

    const seasonId = searchParams.get("seasonId");
    if (seasonId) {
      if (isNaN(Number(seasonId))) {
        return NextResponse.json({ error: "Invalid seasonId" }, { status: 400 });
      }
      const data = await getSeasonEvents(Number(seasonId));
      return NextResponse.json(data);
    }

    if (searchParams.get("live") === "true") {
      const data = await getLiveEvents();
      return NextResponse.json(data);
    }

    // Default: return seasons
    const data = await getSeasons();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
