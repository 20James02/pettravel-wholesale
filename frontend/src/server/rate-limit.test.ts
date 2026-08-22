import assert from "node:assert/strict";
import test from "node:test";

import {
  clearRateLimitsForTests,
  consumeRateLimit,
  getRequestRateLimitKey,
  resetRateLimit
} from "./rate-limit.ts";

test.beforeEach(() => clearRateLimitsForTests());

test("rate limiter blocks after the configured number of attempts and resets by time", () => {
  const options = { limit: 2, windowMs: 60_000 };
  assert.equal(consumeRateLimit("login:client:user", options, 1_000).allowed, true);
  assert.equal(consumeRateLimit("login:client:user", options, 2_000).allowed, true);
  const blocked = consumeRateLimit("login:client:user", options, 3_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 58);
  assert.equal(consumeRateLimit("login:client:user", options, 61_001).allowed, true);
});

test("rate-limit keys separate client and subject without retaining raw PII", () => {
  const request = new Request("https://example.test/api/auth/login", {
    headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1" }
  });
  const key = getRequestRateLimitKey(request, "login", "Owner@Example.com");
  assert.equal(key, "login:203.0.113.8:owner@example.com");

  consumeRateLimit(key, { limit: 1, windowMs: 1_000 }, 0);
  assert.equal(consumeRateLimit(key, { limit: 1, windowMs: 1_000 }, 1).allowed, false);
  resetRateLimit(key);
  assert.equal(consumeRateLimit(key, { limit: 1, windowMs: 1_000 }, 2).allowed, true);
});
