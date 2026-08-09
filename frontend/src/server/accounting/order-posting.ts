import "server-only";

import type { UserAccount } from "@/lib/domain";
import { createSupabaseServiceClient } from "@/server/supabase";

export type AccountingOrderPostingMode = "post_all" | "post_confirmed_payments" | "recognize_sale";

export interface AccountingOrderPostingInput {
  orderId: string;
  mode: AccountingOrderPostingMode;
  vatRateBps: number;
  requireConsumedStock: boolean;
}

export interface AccountingOrderPostingResult {
  status: string;
  mode: AccountingOrderPostingMode;
  createdEntries: number;
  skippedEntries: number;
  createdReceivables: number;
  createdAllocations: number;
}

function normalizePostingResult(value: unknown, fallbackMode: AccountingOrderPostingMode): AccountingOrderPostingResult {
  const result = (value ?? {}) as Record<string, unknown>;
  return {
    status: String(result.status ?? "unknown"),
    mode: (result.mode as AccountingOrderPostingMode | undefined) ?? fallbackMode,
    createdEntries: Number(result.createdEntries ?? 0),
    skippedEntries: Number(result.skippedEntries ?? 0),
    createdReceivables: Number(result.createdReceivables ?? 0),
    createdAllocations: Number(result.createdAllocations ?? 0)
  };
}

export async function postOrderAccounting(
  input: AccountingOrderPostingInput,
  user: UserAccount
): Promise<AccountingOrderPostingResult> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("pt_post_order_accounting", {
    p_order_id: input.orderId,
    p_actor_id: user.id,
    p_mode: input.mode,
    p_vat_rate_bps: input.vatRateBps,
    p_require_consumed_stock: input.requireConsumedStock
  });

  if (error) {
    throw new Error(error.message);
  }

  return normalizePostingResult(data, input.mode);
}
