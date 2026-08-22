import type { OrderItem } from "@/lib/domain";

const CART_STORAGE_VERSION = "v2";

export function cartStorageKeyForUser(userId: string): string {
  return `ptw_cart_${CART_STORAGE_VERSION}_${userId}`;
}

export function legacyCartStorageKeyForUser(userId: string): string {
  return `ptw_cart_${userId}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCartItem(value: unknown): value is OrderItem {
  if (!value || typeof value !== "object") return false;

  const item = value as Record<string, unknown>;
  return (
    isNonEmptyString(item.id) &&
    isNonEmptyString(item.productCode) &&
    isNonEmptyString(item.productName) &&
    isNonEmptyString(item.variantSku) &&
    isNonEmptyString(item.variantLabel) &&
    Number.isInteger(item.quantity) &&
    Number(item.quantity) > 0 &&
    Number(item.quantity) <= 10_000 &&
    typeof item.unitPriceSnapshot === "number" &&
    Number.isFinite(item.unitPriceSnapshot) &&
    item.unitPriceSnapshot >= 0 &&
    isNonEmptyString(item.supplierId) &&
    (item.variantImage === undefined || typeof item.variantImage === "string")
  );
}

export function restoreCartItems(serializedCart: string | null): OrderItem[] {
  if (!serializedCart) return [];

  try {
    const parsed: unknown = JSON.parse(serializedCart);
    if (!Array.isArray(parsed) || !parsed.every(isCartItem)) return [];
    return parsed.map((item) => ({ ...item }));
  } catch {
    return [];
  }
}
