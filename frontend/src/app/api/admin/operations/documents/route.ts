import { NextResponse } from "next/server";
import { operationsDocumentSchema, getValidationErrorMessage } from "@/lib/validation";
import { requirePermission, requireSameOrigin } from "@/server/auth";
import { createOperationsDocument } from "@/server/operations/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = operationsDocumentSchema.parse(await request.json());
    const user = await requirePermission(input.shouldPost ? "operations.post" : "operations.write");
    const document = await createOperationsDocument(input, user);
    return NextResponse.json({ success: true, document });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = getValidationErrorMessage(error, "Không thể tạo chứng từ vận hành.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
