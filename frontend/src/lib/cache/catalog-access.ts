import type { Product } from "@/lib/domain";

export type CatalogAccessScope = "guest" | "customer" | "admin";

const DEFAULT_CATALOG_IMAGE = "/product-food.svg";

interface CatalogSessionLike {
  isAdmin?: boolean;
}

export function resolveCatalogAccessScope(user: CatalogSessionLike | null): CatalogAccessScope {
  if (!user) return "guest";
  return user.isAdmin ? "admin" : "customer";
}

export function catalogCacheKey(scope: CatalogAccessScope): string {
  return `products:${scope}`;
}

function safeCatalogImageUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() ?? "";
  if (!candidate) return fallback;
  if (candidate.startsWith("/")) {
    return candidate.startsWith("//") || candidate.includes("\\") ? fallback : candidate;
  }

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && !url.username && !url.password ? candidate : fallback;
  } catch {
    return fallback;
  }
}

export function sanitizeLegacyCatalogImages(products: Product[]): Product[] {
  return products.map((product) => {
    const productImage = safeCatalogImageUrl(product.imageUrl, DEFAULT_CATALOG_IMAGE);
    return {
      ...product,
      imageUrl: productImage,
      images: product.images
        ?.map((image) => safeCatalogImageUrl(image, ""))
        .filter((image): image is string => Boolean(image)),
      variants: product.variants.map((variant) => ({
        ...variant,
        imageUrl: safeCatalogImageUrl(variant.imageUrl, productImage)
      }))
    };
  });
}

export function catalogResponseCacheControl(scope: CatalogAccessScope): string {
  return scope === "guest"
    ? "public, max-age=30, s-maxage=30, stale-while-revalidate=120"
    : "private, no-store";
}
