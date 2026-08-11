import "server-only";

import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/server/env";

export function createSupabaseServiceClient() {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL || serverEnv.SUPABASE_URL;
  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
