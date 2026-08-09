import type { AdminPolicy, CustomerOrder, QuoteAdjustment } from "@/lib/domain";
import { calculateFinancialSnapshot, type QuoteAdjustmentInput } from "./engine.ts";

function decimalRateToBasisPoints(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return 0;
  return Math.round(rate * 10_000);
}

function toEngineAdjustment(adjustment: QuoteAdjustment): QuoteAdjustmentInput {
  return {
    id: adjustment.id,
    type: adjustment.type,
    label: adjustment.label,
    amountVnd: Math.abs(adjustment.amount)
  };
}

export function normalizeOrderQuoteFinancials(order: CustomerOrder, policy: AdminPolicy): CustomerOrder {
  if (order.quoteVersions.length === 0) return order;

  const depositRateBps = decimalRateToBasisPoints(policy.defaultDepositRate);
  const lines = order.items.map((item) => ({
    id: item.id,
    productCode: item.productCode,
    variantSku: item.variantSku,
    supplierId: item.supplierId,
    quantity: item.quantity,
    unitPriceVnd: item.unitPriceSnapshot
  }));

  return {
    ...order,
    quoteVersions: order.quoteVersions.map((quote) => {
      const originalAdjustmentsById = new Map(quote.adjustments.map((adjustment) => [adjustment.id, adjustment]));
      const snapshot = calculateFinancialSnapshot({
        lines,
        adjustments: quote.adjustments.map(toEngineAdjustment),
        paymentIntent: order.paymentIntent,
        depositRateBps,
        depositAmountVnd: order.paymentIntent === "deposit_cod" ? quote.depositAmount : undefined
      });

      const normalizedAdjustments: QuoteAdjustment[] = snapshot.appliedAdjustments.map((adjustment) => {
        const original = originalAdjustmentsById.get(adjustment.id);
        return {
          id: adjustment.id,
          type: adjustment.type,
          label: adjustment.label,
          amount: adjustment.signedAmountVnd,
          requiresApproval: original?.requiresApproval ?? false
        };
      });

      return {
        ...quote,
        subtotal: snapshot.subtotalVnd,
        adjustments: normalizedAdjustments,
        finalTotal: snapshot.finalTotalVnd,
        depositAmount: snapshot.paymentDueNowVnd,
        codRemaining: snapshot.codRemainingVnd
      };
    })
  };
}
