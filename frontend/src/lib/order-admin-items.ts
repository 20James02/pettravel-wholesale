import type { OrderItem, Product, ProductVariant } from "@/lib/domain";

export const MAX_ORDER_ITEM_QUANTITY = 10_000;

function assertAdminVariant(variant: ProductVariant): asserts variant is ProductVariant & {
  wholesalePrice: number;
  supplierId: string;
} {
  if (!Number.isSafeInteger(variant.wholesalePrice) || (variant.wholesalePrice ?? -1) < 0) {
    throw new Error("Phân loại chưa có giá sỉ hợp lệ.");
  }
  if (!variant.supplierId?.trim()) {
    throw new Error("Phân loại chưa được gắn nhà cung cấp.");
  }
}

function assertQuantity(quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_ITEM_QUANTITY) {
    throw new Error(`Số lượng phải là số nguyên từ 1 đến ${MAX_ORDER_ITEM_QUANTITY}.`);
  }
}

export function addOrMergeAdminOrderItem(
  items: OrderItem[],
  product: Product,
  variant: ProductVariant,
  quantity: number,
  newItemId: string
): OrderItem[] {
  assertQuantity(quantity);
  assertAdminVariant(variant);

  const supplierId = variant.supplierId.trim();
  const existingIndex = items.findIndex(
    (item) => item.variantSku === variant.sku && item.supplierId === supplierId
  );

  if (existingIndex >= 0) {
    const mergedQuantity = items[existingIndex].quantity + quantity;
    assertQuantity(mergedQuantity);
    return items.map((item, index) =>
      index === existingIndex
        ? {
            ...item,
            quantity: mergedQuantity,
            unitPriceSnapshot: variant.wholesalePrice,
            variantImage: variant.imageUrl || product.imageUrl || item.variantImage
          }
        : item
    );
  }

  if (!newItemId.trim()) {
    throw new Error("Không thể tạo mã dòng hàng.");
  }

  return [
    ...items,
    {
      id: newItemId,
      productCode: product.code,
      productName: product.name,
      variantSku: variant.sku,
      variantLabel: variant.label,
      variantImage: variant.imageUrl || product.imageUrl || "/product-food.svg",
      unitPriceSnapshot: variant.wholesalePrice,
      quantity,
      supplierId
    }
  ];
}

export function removeAdminOrderItem(items: OrderItem[], itemId: string): OrderItem[] {
  if (items.length <= 1) {
    throw new Error("Đơn hàng phải còn ít nhất một sản phẩm.");
  }
  const nextItems = items.filter((item) => item.id !== itemId);
  if (nextItems.length === items.length) {
    throw new Error("Không tìm thấy dòng sản phẩm cần xóa.");
  }
  return nextItems;
}
