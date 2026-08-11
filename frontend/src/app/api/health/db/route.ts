import { NextResponse } from "next/server";
import { backendFetchJson } from "@/server/backend-client";

export const runtime = "nodejs";

function requireHealthSecret(request: Request): Response | null {
  if (process.env.NODE_ENV !== "production") return null;

  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const providedSecret =
    request.headers.get("x-health-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("secret") ||
    "";

  if (providedSecret !== configuredSecret) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 }
    );
  }

  return null;
}

export async function GET(request: Request) {
  const unauthorized = requireHealthSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await backendFetchJson("/api/v1/health/db", {
      cache: "no-store"
    });

    return NextResponse.json({
      ok: Boolean(db.ok),
      service: "pettravel-wholesale",
      db,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database healthcheck failed.";
    return NextResponse.json(
      { ok: false, error: message, checkedAt: new Date().toISOString() },
      { status: 500 }
    );
  }
}
