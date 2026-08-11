import type { AdminPolicy, CustomerOrder } from "@/lib/domain";
import { calculateFinancialSnapshot } from "./engine.ts";

export function normalizeOrderQuoteFinancials(order: CustomerOrder, policy: AdminPolicy): CustomerOrder {
  const depositRateBps = Math.round(policy.defaultDepositRate * 10_000);

  return {
    ...order,
    quoteVersions: order.quoteVersions.map((quote) => {
      const snapshot = calculateFinancialSnapshot({
        lines: order.items.map((item) => ({
          id: item.id,
          productCode: item.productCode,
          variantSku: item.variantSku,
          supplierId: item.supplierId,
          quantity: item.quantity,
          unitPriceVnd: item.unitPriceSnapshot
        })),
        adjustments: quote.adjustments.map((adjustment) => ({
          id: adjustment.id,
          type: adjustment.type,
          label: adjustment.label,
          amountVnd: Math.abs(adjustment.amount)
        })),
        paymentIntent: order.paymentIntent,
        depositRateBps
      });

      return {
        ...quote,
        subtotal: snapshot.subtotalVnd,
        adjustments: quote.adjustments.map((adjustment, index) => ({
          ...adjustment,
          amount: snapshot.appliedAdjustments[index]?.signedAmountVnd ?? adjustment.amount
        })),
        finalTotal: snapshot.finalTotalVnd,
        depositAmount: order.paymentIntent === "pay_full" ? snapshot.finalTotalVnd : snapshot.depositAmountVnd,
        codRemaining: order.paymentIntent === "pay_full" ? 0 : snapshot.codRemainingVnd
      };
    })
  };
}
