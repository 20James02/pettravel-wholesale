import "server-only";

import type {
  OperationsDocumentSummary,
  OperationsDocumentType,
  OperationsOverview,
  UserAccount
} from "@/lib/domain";
import { backendFetchJson as backendFetch } from "@/server/backend-client";

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
