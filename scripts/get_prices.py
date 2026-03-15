#!/usr/bin/env python3
"""Fetch real-time stock data via yfinance. Output JSON to stdout."""
import sys, json
import yfinance as yf

WATCHLIST = ["META", "NFLX", "NVDA", "OXY"]

def get_stocks():
    result = []
    for ticker in WATCHLIST:
        try:
            t = yf.Ticker(ticker)
            info = t.fast_info
            hist = t.history(period="30d", interval="1d")

            price = round(info.get("lastPrice", 0), 2)
            prev_close = round(info.get("previousClose", price), 2)
            change_amt = round(price - prev_close, 2)
            change_pct = round((change_amt / prev_close * 100) if prev_close else 0, 2)

            # 30-day price history
            history = []
            for date, row in hist.iterrows():
                history.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "close": round(float(row["Close"]), 2),
                })

            result.append({
                "ticker": ticker,
                "price": price,
                "changeAmt": change_amt,
                "changePct": change_pct,
                "prevClose": prev_close,
                "history": history,
            })
        except Exception as e:
            result.append({"ticker": ticker, "error": str(e)})

    print(json.dumps(result))

if __name__ == "__main__":
    get_stocks()
