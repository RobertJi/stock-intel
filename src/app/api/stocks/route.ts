import { execSync } from "child_process";
import { NextResponse } from "next/server";
import path from "path";

export const revalidate = 60; // cache 60s

export async function GET() {
  try {
    const scriptPath = path.join(process.cwd(), "scripts", "get_prices.py");
    const output = execSync(`python3 ${scriptPath}`, { timeout: 20000 }).toString();
    const data = JSON.parse(output);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
