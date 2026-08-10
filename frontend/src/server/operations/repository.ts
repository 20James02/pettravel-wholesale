import "server-only";

import type {
  OperationsDocumentSummary,
  OperationsDocumentType,
  OperationsOverview,
  UserAccount
} from "@/lib/domain";

export interface CreateOperationsDocumentInput {
  type: OperationsDocumentType;
  documentNo?: string;
  partnerName?: string;
  note?: string;
  lines?: Array<{
    productVariantId?: string;
    sku?: string;
    description: string;
    quantity: number;
    unitCostVnd: number;
    supplierId?: string;
  }>;
  expenseCategory?: string;
  amountVnd?: number;
  shouldPost?: boolean;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function backendFetch(path: string, options: RequestInit = {}) {
  const url = `${BACKEND_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend error: ${response.status} - ${text}`);
  }
  return response.json();
}

export async function getOperationsOverview(user: UserAccount): Promise<OperationsOverview> {
  return backendFetch(`/api/v1/operations/overview?org_id=${user.organizationId || ""}`);
}

export async function createOperationsDocument(
  input: CreateOperationsDocumentInput,
  user: UserAccount
): Promise<OperationsDocumentSummary> {
  return backendFetch(`/api/v1/operations/documents`, {
    method: "POST",
    body: JSON.stringify({
      ...input,
      userId: user.id,
      organizationId: user.organizationId || "00000000-0000-0000-0000-000000000103"
    })
  });
}

