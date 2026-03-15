import { execSync } from "child_process";
import path from "path";

export interface StockData {
  ticker: string;
  price: number;
  changeAmt: number;
  changePct: number;
  prevClose: number;
  history: { date: string; close: number }[];
  error?: string;
}

export interface EventData {
  ticker: string;
  type: string;
  title: string;
  date: string;
  link: string;
  impact: "BULLISH" | "BEARISH" | "NEUTRAL";
  description: string;
  error?: string;
}

const SCRIPTS = path.join(process.cwd(), "scripts");

export async function fetchStocks(): Promise<StockData[]> {
  try {
    const out = execSync(`python3 ${SCRIPTS}/get_prices.py`, { timeout: 20000 }).toString();
    return JSON.parse(out);
  } catch {
    return [];
  }
}

export async function fetchEvents(): Promise<EventData[]> {
  try {
    const out = execSync(`python3 ${SCRIPTS}/get_events.py`, { timeout: 30000 }).toString();
    return JSON.parse(out);
  } catch {
    return [];
  }
}
