import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth";
import { products, sanitizeProductsForRole } from "@/lib/mock-data";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();

  let role: "guest" | "customer" | "admin" = "guest";
  if (user?.isAdmin) {
    role = "admin";
  } else if (user) {
    role = "customer";
  }

  const data = sanitizeProductsForRole(products, role);
  return NextResponse.json({ products: data, role });
}
