import "server-only";

import type { UserAccount } from "@/lib/domain";
import { backendFetchJson } from "@/server/backend-client";

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
  void user;

  const data = await backendFetchJson("/api/v1/accounting/order-posting", {
    method: "POST",
    body: JSON.stringify({
      orderId: input.orderId,
      mode: input.mode,
      vatRateBps: input.vatRateBps,
      requireConsumedStock: input.requireConsumedStock
    })
  });
  
  return normalizePostingResult(data.result, input.mode);
}
