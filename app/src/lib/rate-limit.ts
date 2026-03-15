/**
 * Simple in-memory rate limiter and connection counter.
 * Resets on server restart — fine for a small app.
 */

const hits = new Map<string, { count: number; resetAt: number }>();

/** Returns true if the request should be rejected. */
export function isRateLimited(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  entry.count++;
  return entry.count > maxRequests;
}

/** Track active SSE connections. */
let sseConnectionCount = 0;
const MAX_SSE_CONNECTIONS = 50;

export function canOpenSSE(): boolean {
  return sseConnectionCount < MAX_SSE_CONNECTIONS;
}

export function sseOpened(): void {
  sseConnectionCount++;
}

export function sseClosed(): void {
  sseConnectionCount = Math.max(0, sseConnectionCount - 1);
}
