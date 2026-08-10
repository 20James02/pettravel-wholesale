import type { AdminPolicy, CustomerOrder } from "@/lib/domain";

export function normalizeOrderQuoteFinancials(order: CustomerOrder, policy: AdminPolicy): CustomerOrder {
  return order;
}
