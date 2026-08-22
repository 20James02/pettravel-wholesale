import type { CustomerOrder, PermissionKey, UserAccount } from "../lib/domain.ts";

function changed<T>(left: T, right: T): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

export function hasQuoteOwnershipWork(
  before: CustomerOrder,
  after: CustomerOrder
): boolean {
  return (
    changed(before.items, after.items) ||
    changed(before.quoteVersions, after.quoteVersions) ||
    before.commercialStatus !== after.commercialStatus ||
    before.assignedStaffId !== after.assignedStaffId
  );
}

export function getMissingOrderPermissions(
  before: CustomerOrder,
  after: CustomerOrder,
  user: UserAccount
): PermissionKey[] {
  if (user.role === "super_admin") return [];
  const required = new Set<PermissionKey>();

  if (hasQuoteOwnershipWork(before, after)) {
    required.add("order.quote");
  }
  if (
    changed(
      before.quoteVersions.map((quote) => quote.adjustments),
      after.quoteVersions.map((quote) => quote.adjustments)
    )
  ) {
    required.add("order.adjust");
  }
  if (
    before.paymentStatus !== after.paymentStatus ||
    changed(before.paymentRequests, after.paymentRequests) ||
    changed(before.paymentProofs, after.paymentProofs)
  ) {
    required.add("order.confirm_payment");
  }
  if (
    before.fulfillmentStatus !== after.fulfillmentStatus ||
    changed(before.fulfillmentGroups, after.fulfillmentGroups) ||
    changed(before.shipment, after.shipment)
  ) {
    required.add("order.ship");
  }
  if (
    changed(
      before.comments.filter((comment) => comment.audience === "internal"),
      after.comments.filter((comment) => comment.audience === "internal")
    )
  ) {
    required.add("order.comment_internal");
  }

  return [...required].filter((permission) => !user.permissions.includes(permission));
}
