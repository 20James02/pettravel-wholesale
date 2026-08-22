import type { CustomerOrder } from "./domain";


export function isCurrentTradingOrder(order: CustomerOrder): boolean {
  return order.commercialStatus !== "cancelled" && order.fulfillmentStatus !== "delivered";
}


export function findCurrentTradingOrder(orders: CustomerOrder[]): CustomerOrder | undefined {
  return orders
    .filter(isCurrentTradingOrder)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}
