import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "stock-intel.db");

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS stocks (
    ticker TEXT PRIMARY KEY,
    price REAL NOT NULL,
    change_pct REAL NOT NULL DEFAULT 0,
    change_amt REAL NOT NULL DEFAULT 0,
    prev_close REAL NOT NULL DEFAULT 0,
    history TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'edgar',
    link TEXT,
    impact TEXT NOT NULL DEFAULT 'NEUTRAL',
    description TEXT,
    metadata TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_events_ticker ON events(ticker);
  CREATE INDEX IF NOT EXISTS idx_events_date ON events(date DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedup ON events(ticker, title, date, source);

  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    ran_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

export default db;

type StockRow = {
  ticker: string;
  price: number;
  change_pct: number;
  change_amt: number;
  prev_close: number;
  history: string;
  updated_at: number;
};

type EventRow = {
  id: number;
  ticker: string;
  type: string;
  title: string;
  date: string;
  source: string;
  link: string | null;
  impact: "BULLISH" | "BEARISH" | "NEUTRAL";
  description: string | null;
  metadata: string | null;
};

export function getStocks() {
  const rows = db.prepare("SELECT * FROM stocks ORDER BY ticker").all() as StockRow[];
  return rows.map((row) => ({
    ticker: row.ticker,
    price: row.price,
    changePct: row.change_pct,
    changeAmt: row.change_amt,
    prevClose: row.prev_close,
    history: JSON.parse(row.history) as { date: string; close: number }[],
    updatedAt: row.updated_at,
  }));
}

export function getEvents(ticker?: string, limit = 50) {
  const query = ticker
    ? db.prepare("SELECT * FROM events WHERE ticker = ? ORDER BY date DESC, id DESC LIMIT ?")
    : db.prepare("SELECT * FROM events ORDER BY date DESC, id DESC LIMIT ?");
  const rows = (ticker ? query.all(ticker, limit) : query.all(limit)) as EventRow[];

  return rows.map((row) => ({
    id: row.id,
    ticker: row.ticker,
    type: row.type,
    title: row.title,
    date: row.date,
    source: row.source,
    link: row.link ?? undefined,
    impact: row.impact as "BULLISH" | "BEARISH" | "NEUTRAL",
    description: row.description ?? undefined,
    descriptionZh: (row as any).description_zh ?? undefined,
    metadata: JSON.parse(row.metadata || "{}") as Record<string, unknown>,
  }));
}

export function isStockFresh(ticker: string, maxAgeSeconds = 60): boolean {
  const row = db.prepare("SELECT updated_at FROM stocks WHERE ticker = ?").get(ticker) as
    | { updated_at: number }
    | undefined;
  if (!row) return false;
  return Date.now() / 1000 - row.updated_at < maxAgeSeconds;
}

export function areAllStocksFresh(tickers: string[], maxAgeSeconds = 60): boolean {
  return tickers.every((ticker) => isStockFresh(ticker, maxAgeSeconds));
}

export function isSyncFresh(type: string, maxAgeSeconds: number): boolean {
  const row = db
    .prepare("SELECT ran_at FROM sync_log WHERE type = ? AND status = 'ok' ORDER BY ran_at DESC LIMIT 1")
    .get(type) as { ran_at: number } | undefined;
  if (!row) return false;
  return Date.now() / 1000 - row.ran_at < maxAgeSeconds;
}
