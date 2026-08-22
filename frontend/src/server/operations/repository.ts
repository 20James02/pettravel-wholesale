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

function requireOrganizationId(user: UserAccount): string {
  const organizationId = user.organizationId?.trim();
  if (!organizationId) {
    throw new Error("ORGANIZATION_REQUIRED: Tài khoản chưa được gắn với tổ chức vận hành.");
  }
  return organizationId;
}

export async function getOperationsOverview(user: UserAccount): Promise<OperationsOverview> {
  const organizationId = requireOrganizationId(user);
  return backendFetch(`/api/v1/operations/overview?org_id=${encodeURIComponent(organizationId)}`);
}

export async function createOperationsDocument(
  input: CreateOperationsDocumentInput,
  user: UserAccount
): Promise<OperationsDocumentSummary> {
  const organizationId = requireOrganizationId(user);
  return backendFetch(`/api/v1/operations/documents`, {
    method: "POST",
    body: JSON.stringify({
      ...input,
      userId: user.id,
      organizationId
    })
  });
}
