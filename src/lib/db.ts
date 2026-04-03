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
  // SEC 事件和市场新闻分开查，各取各的配额，避免互相挤占
  const mapRow = (row: EventRow) => ({
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
  });

  if (ticker) {
    // 股票详情页：所有事件混合，不限类型
    const rows = db.prepare(
      "SELECT * FROM events WHERE ticker = ? ORDER BY date DESC, id DESC LIMIT ?"
    ).all(ticker, limit) as EventRow[];
    return rows.map(mapRow);
  }

  // 首页：SEC 事件（非 MARKET_NEWS）50 条 + 市场新闻 30 条，合并返回
  const secRows = db.prepare(
    "SELECT * FROM events WHERE type != 'MARKET_NEWS' ORDER BY date DESC, id DESC LIMIT ?"
  ).all(limit) as EventRow[];

  const newsRows = db.prepare(
    "SELECT * FROM events WHERE type = 'MARKET_NEWS' ORDER BY date DESC, id DESC LIMIT 30"
  ).all() as EventRow[];

  return [...secRows.map(mapRow), ...newsRows.map(mapRow)];
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
