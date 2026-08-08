import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/server/supabase";
import { createR2UploadUrl } from "@/server/r2";
import { serverEnv } from "@/server/env";

export const runtime = "nodejs";

export async function GET() {
  const diagnostics: Record<string, any> = {
    service: "pettravel-wholesale",
    timestamp: new Date().toISOString(),
    envStatus: {},
    database: { connected: false },
    r2: { connected: false }
  };

  // 1. Check env presence (masked)
  const envKeys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_BASE_URL"
  ] as const;

  envKeys.forEach((key) => {
    const val = process.env[key];
    diagnostics.envStatus[key] = val
      ? `Present (length: ${val.length}, prefix: ${val.slice(0, 8)}...)`
      : "MISSING";
  });

  // 2. Test Supabase Database
  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase.from("suppliers").select("count").limit(1);
    if (error) {
      diagnostics.database = {
        connected: false,
        error: error.message,
        hint: error.hint
      };
    } else {
      diagnostics.database = {
        connected: true,
        message: "Successfully queried Supabase 'suppliers' table baseline."
      };
    }
  } catch (err) {
    diagnostics.database = {
      connected: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }

  // 3. Test Cloudflare R2 Storage
  try {
    const r2Result = await createR2UploadUrl({
      orderId: "healthcheck-test",
      fileName: "test-probe.png",
      contentType: "image/png",
      purpose: "payment-proof"
    });
    diagnostics.r2 = {
      connected: true,
      message: "Successfully generated presigned upload URL.",
      key: r2Result.key
    };
  } catch (err) {
    diagnostics.r2 = {
      connected: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }

  const isHealthy = diagnostics.database.connected && diagnostics.r2.connected;

  return NextResponse.json(diagnostics, { status: isHealthy ? 200 : 500 });
}
