import { NextResponse } from "next/server";
import { fetchEvents } from "@/lib/server-data";

export const revalidate = 300; // cache 5min

export async function GET() {
  try {
    const data = await fetchEvents();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
