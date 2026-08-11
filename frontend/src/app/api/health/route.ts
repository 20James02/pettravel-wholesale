import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "pettravel-wholesale",
    deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    checkedAt: new Date().toISOString()
  });
}
