import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "Dang ky cong khai da tat. Tai khoan chi duoc Admin cap." },
    { status: 404 }
  );
}
