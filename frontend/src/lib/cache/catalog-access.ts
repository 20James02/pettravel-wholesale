export type CatalogAccessScope = "guest" | "customer" | "admin";

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
