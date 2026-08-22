/**
 * =====================================================================
 * PET TRAVEL WHOLESALE - NORMALIZED ENTITY STORE & SWR CACHE
 * =====================================================================
 * Implements:
 * - Normalized entity maps (ordersById, productsById, usersById, suppliersById)
 * - SWR (Stale-While-Revalidate) with background authoritative revalidation
 * - Entity revision tracking & conflict-free delta patching
 * - Request SingleFlight Promise coalescing
 */

import type { CustomerOrder, Product, Supplier } from "@/lib/domain";
import type { ApiUser } from "@/features/pettravel/types";

export interface OrderSummaryDTO {
  id: string;
  number: string;
  customerName: string;
  customerCompany: string;
  customerId: string;
  assignedStaffId?: string | null;
  assignedStaffName?: string | null;
  commercialStatus: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  paymentIntent: string;
  invoiceRequested: boolean;
  createdAt: string;
  updatedAt: string;
  finalTotal: number;
  depositAmount: number;
  itemsCount: number;
  revision: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  revision?: string;
}

class NormalizedEntityStore {
  private orders = new Map<string, CustomerOrder>();
  private orderSummaries: OrderSummaryDTO[] = [];
  private products = new Map<string, Product>();
  private suppliers = new Map<string, Supplier>();
  private users = new Map<string, ApiUser>();
  private categories: string[] = [];

  private swrCache = new Map<string, CacheEntry<unknown>>();
  private inFlightPromises = new Map<string, Promise<unknown>>();

  private STALE_TIME_MS = 15_000; // 15 seconds SWR freshness window

  // ── ORDER ENTITIES ──────────────────────────────────────────

  setOrders(ordersList: CustomerOrder[]): void {
    this.orders.clear();
    for (const order of ordersList) {
      this.orders.set(order.id, order);
    }
  }

  clearOrders(): void {
    this.orders.clear();
    this.orderSummaries = [];
    this.invalidate("orders:");
  }

  getOrder(id: string): CustomerOrder | undefined {
    return this.orders.get(id);
  }

  getAllOrders(): CustomerOrder[] {
    return Array.from(this.orders.values());
  }

  setOrderSummaries(summaries: OrderSummaryDTO[]): void {
    this.orderSummaries = summaries;
  }

  getOrderSummaries(): OrderSummaryDTO[] {
    return this.orderSummaries;
  }

  /**
   * Delta Patch: Updates a single order entity and summary without full refetch
   */
  patchOrder(orderId: string, patch: Partial<CustomerOrder> & { revision?: string }): void {
    const existing = this.orders.get(orderId);
    if (existing) {
      const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      this.orders.set(orderId, updated);
    }

    // Update in summaries if present
    const summaryIndex = this.orderSummaries.findIndex((s) => s.id === orderId);
    if (summaryIndex >= 0) {
      this.orderSummaries[summaryIndex] = {
        ...this.orderSummaries[summaryIndex],
        ...patch,
        updatedAt: new Date().toISOString(),
        revision: patch.revision || this.orderSummaries[summaryIndex].revision
      } as OrderSummaryDTO;
    }
  }

  // ── PRODUCT ENTITIES ────────────────────────────────────────

  setProducts(productsList: Product[]): void {
    for (const product of productsList) {
      this.products.set(product.id, product);
    }
  }

  getProduct(id: string): Product | undefined {
    return this.products.get(id);
  }

  getAllProducts(): Product[] {
    return Array.from(this.products.values());
  }

  // ── USER ENTITIES ───────────────────────────────────────────

  setUsers(usersList: ApiUser[]): void {
    for (const user of usersList) {
      this.users.set(user.id, user);
    }
  }

  getAllUsers(): ApiUser[] {
    return Array.from(this.users.values());
  }

  // ── SWR (STALE-WHILE-REVALIDATE) ────────────────────────────

  /**
   * Fetches data with SWR policy and SingleFlight coalescing:
   * 1. If fresh cache exists -> return immediately
   * 2. If stale cache exists -> return cached, revalidate in background via callback
   * 3. If no cache -> await fresh fetch
   */
  async swrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    onBackgroundRevalidate?: (freshData: T) => void
  ): Promise<{ data: T; isStale: boolean }> {
    const cached = this.swrCache.get(key) as CacheEntry<T> | undefined;
    const now = Date.now();

    if (cached) {
      const isStale = now - cached.timestamp > this.STALE_TIME_MS;
      if (!isStale) {
        return { data: cached.data, isStale: false };
      }

      // Background revalidation
      if (onBackgroundRevalidate) {
        void this.coalescedFetch(key, fetcher).then((fresh) => {
          this.swrCache.set(key, { data: fresh, timestamp: Date.now() });
          onBackgroundRevalidate(fresh);
        });
      }

      return { data: cached.data, isStale: true };
    }

    // No cache exists, must await
    const fresh = await this.coalescedFetch(key, fetcher);
    this.swrCache.set(key, { data: fresh, timestamp: Date.now() });
    return { data: fresh, isStale: false };
  }

  /**
   * SingleFlight: Coalesces concurrent calls to the same key into a single Promise
   */
  private async coalescedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = this.inFlightPromises.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = (async () => {
      try {
        return await fetcher();
      } finally {
        this.inFlightPromises.delete(key);
      }
    })();

    this.inFlightPromises.set(key, promise);
    return promise as Promise<T>;
  }

  invalidate(keyPrefix?: string): void {
    if (!keyPrefix) {
      this.swrCache.clear();
      return;
    }
    for (const key of this.swrCache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.swrCache.delete(key);
      }
    }
  }
}

export const entityStore = new NormalizedEntityStore();
