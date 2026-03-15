import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/climbers?sessionId=xxx
 * Returns the user's watchlist.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }

  const entries = await prisma.watchlistEntry.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(entries);
}

/**
 * POST /api/climbers — add a climber to watchlist
 * Body: { sessionId, climberId, climberName, competitionId }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { sessionId, climberId, climberName, competitionId } = body;

  if (!sessionId || !climberId || !climberName || !competitionId) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const entry = await prisma.watchlistEntry.upsert({
    where: {
      sessionId_climberId_competitionId: {
        sessionId,
        climberId,
        competitionId,
      },
    },
    create: { sessionId, climberId, climberName, competitionId },
    update: {},
  });

  return NextResponse.json(entry);
}

/**
 * DELETE /api/climbers — remove a climber from watchlist
 * Body: { sessionId, climberId, competitionId }
 */
export async function DELETE(request: Request) {
  const body = await request.json();
  const { sessionId, climberId, competitionId } = body;

  if (!sessionId || !climberId || !competitionId) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  await prisma.watchlistEntry.deleteMany({
    where: { sessionId, climberId, competitionId },
  });

  return NextResponse.json({ ok: true });
}
