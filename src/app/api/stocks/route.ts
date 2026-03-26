import { NextResponse } from "next/server";
import { fetchStocks } from "@/lib/server-data";

export const revalidate = 60; // cache 60s

export async function GET() {
  try {
    const data = await fetchStocks();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
