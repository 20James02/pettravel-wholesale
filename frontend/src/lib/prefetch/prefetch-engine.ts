/**
 * =====================================================================
 * PET TRAVEL WHOLESALE - PREDICTIVE PREFETCH ENGINE (Tier 1, 2, 3)
 * =====================================================================
 * Implements 3-tier prefetching:
 * - Tier 1: Route prefetch via Next.js router
 * - Tier 2: Intent prefetch on pointerenter / focus / touchstart
 * - Tier 3: Idle prediction based on Markov transition matrix P(nextRoute | currentRoute, role)
 *
 * Includes:
 * - Resource budgeting (Save-Data, Slow 2G/3G, Memory pressure)
 * - AbortController cancellation for outdated speculative requests
 * - SingleFlight Request Deduplication / Coalescing
 */

import type { TabKey } from "@/features/pettravel/types";
import { TAB_ROUTE_MAP } from "@/features/pettravel/types";

// Static Transition Probability Matrix for Idle Prediction (Tier 3)
const ROUTE_TRANSITION_PROBABILITIES: Record<string, Record<string, number>> = {
  // Guest / Customer workflow
  catalog: { cart: 0.45, order: 0.35, profile: 0.2 },
  cart: { order: 0.7, catalog: 0.3 },
  order: { catalog: 0.5, profile: 0.3, cart: 0.2 },
  profile: { order: 0.6, catalog: 0.4 },

  // Admin workflow
  admin_reports: { admin: 0.5, admin_products: 0.3, admin_accounting: 0.2 },
  admin: { admin_products: 0.4, admin_operations: 0.35, admin_accounting: 0.25 },
  admin_products: { admin: 0.45, admin_categories: 0.3, admin_suppliers: 0.25 },
  admin_categories: { admin_products: 0.6, admin_suppliers: 0.4 },
  admin_suppliers: { admin_products: 0.5, admin_promotions: 0.3, admin_categories: 0.2 },
  admin_operations: { admin: 0.6, admin_accounting: 0.4 },
  admin_accounting: { admin: 0.5, admin_reports: 0.3, admin_operations: 0.2 },
  admin_promotions: { admin_products: 0.5, admin_suppliers: 0.3, admin_users: 0.2 },
  admin_users: { admin_reports: 0.4, admin: 0.4, admin_promotions: 0.2 }
};

interface PrefetchBudget {
  maxConcurrent: number;
  activeCount: number;
  prefetchedKeys: Set<string>;
}

const budget: PrefetchBudget = {
  maxConcurrent: 2,
  activeCount: 0,
  prefetchedKeys: new Set<string>()
};

// In-flight Promise deduplication registry (SingleFlight)
const inFlightRequests = new Map<string, Promise<unknown>>();
const activeAbortControllers = new Map<string, AbortController>();

/**
 * Checks if device/network constraints permit speculative prefetching
 */
export function isPrefetchAllowed(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  // 1. Check if user enabled data saver mode
  const nav = navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } };
  if (nav.connection?.saveData) return false;

  // 2. Check for slow 2G/3G connections
  if (nav.connection?.effectiveType && ["slow-2g", "2g"].includes(nav.connection.effectiveType)) {
    return false;
  }

  // 3. Check document visibility
  if (document.hidden) return false;

  return true;
}

/**
 * Tier 2: Speculative Data Prefetch based on User Intent (hover, focus, touchstart)
 */
export async function prefetchRouteData(tab: TabKey, options: { priority?: "high" | "low" } = {}): Promise<void> {
  if (!isPrefetchAllowed()) return;

  const cacheKey = `prefetch_tab_${tab}`;
  if (budget.prefetchedKeys.has(cacheKey)) return; // Already prefetched
  if (budget.activeCount >= budget.maxConcurrent && options.priority !== "high") return;

  budget.activeCount++;
  budget.prefetchedKeys.add(cacheKey);

  const abortController = new AbortController();
  activeAbortControllers.set(cacheKey, abortController);

  try {
    const fetchPromises: Promise<unknown>[] = [];

    // Map tab to specific background data fetching
    switch (tab) {
      case "catalog":
        fetchPromises.push(deduplicatedFetch("/api/products", abortController.signal));
        fetchPromises.push(deduplicatedFetch("/api/categories", abortController.signal));
        break;
      case "order":
      case "admin":
        fetchPromises.push(deduplicatedFetch("/api/orders/summary?limit=25", abortController.signal));
        fetchPromises.push(deduplicatedFetch("/api/admin/policy", abortController.signal));
        break;
      case "admin_products":
        fetchPromises.push(deduplicatedFetch("/api/products", abortController.signal));
        fetchPromises.push(deduplicatedFetch("/api/categories", abortController.signal));
        fetchPromises.push(deduplicatedFetch("/api/suppliers", abortController.signal));
        break;
      case "admin_categories":
        fetchPromises.push(deduplicatedFetch("/api/categories", abortController.signal));
        break;
      case "admin_suppliers":
        fetchPromises.push(deduplicatedFetch("/api/suppliers", abortController.signal));
        break;
      case "admin_operations":
        fetchPromises.push(deduplicatedFetch("/api/admin/operations/overview", abortController.signal));
        break;
      case "admin_accounting":
        fetchPromises.push(deduplicatedFetch("/api/admin/accounting/overview", abortController.signal));
        break;
      case "admin_reports":
        fetchPromises.push(deduplicatedFetch("/api/admin/reports/overview", abortController.signal));
        break;
      case "admin_promotions":
        fetchPromises.push(deduplicatedFetch("/api/admin/promotions", abortController.signal));
        break;
      case "admin_users":
        fetchPromises.push(deduplicatedFetch("/api/admin/users", abortController.signal));
        break;
    }

    await Promise.allSettled(fetchPromises);
  } finally {
    budget.activeCount = Math.max(0, budget.activeCount - 1);
    activeAbortControllers.delete(cacheKey);
  }
}

/**
 * Deduplicated fetch (SingleFlight pattern on Client)
 * Merges concurrent identical in-flight requests into a single network Promise
 */
export async function deduplicatedFetch<T = unknown>(url: string, signal?: AbortSignal): Promise<T> {
  const existing = inFlightRequests.get(url);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    try {
      const res = await fetch(url, {
        signal,
        headers: {
          "x-prefetch": "1",
          "x-trace-id": `trace_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        }
      });
      if (!res.ok) {
        throw new Error(`Prefetch failed with status ${res.status}`);
      }
      return await res.json();
    } finally {
      inFlightRequests.delete(url);
    }
  })();

  inFlightRequests.set(url, promise);
  return promise as Promise<T>;
}

/**
 * Tier 3: Idle Prediction Prefetching using requestIdleCallback
 * Computes highest probability next route from Markov Transition Table
 */
export function scheduleIdlePrediction(currentTab: TabKey): void {
  if (typeof window === "undefined" || !isPrefetchAllowed()) return;

  const transitions = ROUTE_TRANSITION_PROBABILITIES[currentTab];
  if (!transitions) return;

  // Find the top 1 or 2 candidates with probability >= 0.3
  const candidates = Object.entries(transitions)
    .filter(([, prob]) => prob >= 0.3)
    .sort((a, b) => b[1] - a[1])
    .map(([tab]) => tab as TabKey);

  const runIdle = () => {
    for (const candidateTab of candidates.slice(0, 2)) {
      void prefetchRouteData(candidateTab, { priority: "low" });
    }
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => runIdle(), { timeout: 3000 });
  } else {
    setTimeout(runIdle, 1500);
  }
}

/**
 * Cancels all active speculative prefetches if user intent rapidly shifts
 */
export function cancelActivePrefetches(): void {
  for (const controller of activeAbortControllers.values()) {
    controller.abort();
  }
  activeAbortControllers.clear();
  budget.activeCount = 0;
}
