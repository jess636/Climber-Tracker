import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VAPID_PUBLIC_KEY } from "@/lib/webpush";

/**
 * GET /api/push — returns VAPID public key for client subscription
 */
export async function GET() {
  return NextResponse.json({ publicKey: VAPID_PUBLIC_KEY });
}

/**
 * POST /api/push — save a push subscription
 * Body: { sessionId, endpoint, keys: { p256dh, auth } }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { sessionId, endpoint, keys } = body;

  if (!sessionId || !endpoint || !keys) {
    return NextResponse.json(
      { error: "sessionId, endpoint, and keys are required" },
      { status: 400 }
    );
  }

  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      sessionId,
      endpoint,
      keys: JSON.stringify(keys),
    },
    update: {
      sessionId,
      keys: JSON.stringify(keys),
    },
  });

  return NextResponse.json({ id: sub.id });
}
