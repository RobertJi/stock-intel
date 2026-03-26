import { execFileSync, spawn } from "child_process";
import path from "path";
import { areAllStocksFresh, getEvents, getStocks, isSyncFresh } from "@/lib/db";

export type {} // keep file as a module

const WATCHLIST = ["META", "NFLX", "NVDA", "OXY"];
const SCRIPT = path.join(process.cwd(), "scripts", "sync_db.py");

function triggerSync(mode: "prices" | "events" | "all" = "all") {
  const child = spawn("python3", [SCRIPT, mode], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export async function fetchStocks() {
  if (areAllStocksFresh(WATCHLIST, 60)) {
    return getStocks();
  }

  try {
    execFileSync("python3", [SCRIPT, "prices"], { timeout: 25000, stdio: "ignore" });
  } catch (error) {
    console.error("Price sync failed:", error);
  }

  return getStocks();
}

export async function fetchEvents(ticker?: string) {
  const events = getEvents(ticker, 50);

  if (!isSyncFresh("events", 600)) {
    triggerSync("events");
  }

  return events;
}

export type StockData = ReturnType<typeof getStocks>[number];
export type EventData = ReturnType<typeof getEvents>[number];
