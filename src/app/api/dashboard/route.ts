import { NextResponse } from "next/server";
import { getDashboardPayload } from "@/lib/dashboard-data";

export async function GET() {
  try {
    const data = await getDashboardPayload();
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
