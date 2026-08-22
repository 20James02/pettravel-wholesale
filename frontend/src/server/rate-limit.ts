import { createHash } from "node:crypto";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const buckets = new Map<string, RateLimitBucket>();

export function digestRateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compactExpiredBuckets(now: number): void {
  if (buckets.size < 1_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function getRequestRateLimitKey(request: Request, scope: string, subject = ""): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientAddress = forwardedFor || request.headers.get("x-real-ip")?.trim() || "unknown";
  return `${scope}:${clientAddress.slice(0, 128)}:${subject.trim().toLowerCase().slice(0, 256)}`;
}

export function consumeRateLimit(
  rawKey: string,
  options: { limit: number; windowMs: number },
  now = Date.now()
): RateLimitResult {
  compactExpiredBuckets(now);
  const key = digestRateLimitKey(rawKey);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: Math.max(0, options.limit - 1), retryAfterSeconds: 0 };
  }

  if (current.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000))
    };
  }

  current.count += 1;
  return { allowed: true, remaining: options.limit - current.count, retryAfterSeconds: 0 };
}

export function resetRateLimit(rawKey: string): void {
  buckets.delete(digestRateLimitKey(rawKey));
}

export function clearRateLimitsForTests(): void {
  buckets.clear();
}
