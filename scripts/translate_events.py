#!/usr/bin/env python3
"""
Batch translate event descriptions to Chinese.
Run separately: python3 scripts/translate_events.py
Designed to be resilient: skips failures, retries later.
"""
import sqlite3, sys, time, json
import requests

DB_PATH = "/home/claw/dev/stock-intel/app/data/stock-intel.db"
MINIMAX_KEY = "sk-api-dWCNRdrMDAckdpmjELg5cfoNrM6LrfDGSqeIk0aXIb09qfPZrsQAF7uO-cTf7py_VvE9fGZOP_2RBboQyVrBQRouvlzbgp79FHXjOMYCxlp55aF6AkCSHdA"
MINIMAX_URL = "https://api.minimax.io/anthropic/v1/messages"

def translate(text: str, retries=2) -> str:
    if not text or len(text.strip()) < 10:
        return text
    for attempt in range(retries):
        try:
            r = requests.post(
                MINIMAX_URL,
                json={
                    "model": "MiniMax-M2.5",
                    "max_tokens": 300,
                    "messages": [{"role": "user", "content":
                        f"将以下美股SEC公告翻译成简洁中文（80字以内），只返回翻译，不加解释：\n\n{text[:600]}"
                    }]
                },
                headers={"x-api-key": MINIMAX_KEY, "anthropic-version": "2023-06-01"},
                timeout=45
            )
            data = r.json()
            for block in data.get("content", []):
                if block.get("type") == "text" and block["text"].strip():
                    return block["text"].strip()
        except Exception as e:
            print(f"  attempt {attempt+1} failed: {e}", file=sys.stderr)
            time.sleep(3)
    return ""

def main():
    db = sqlite3.connect(DB_PATH)
    rows = db.execute("""
        SELECT id, description FROM events
        WHERE description IS NOT NULL AND description != ""
        AND (description_zh IS NULL OR description_zh = "" OR description_zh = description)
        ORDER BY date DESC
        LIMIT 50
    """).fetchall()

    print(f"待翻译: {len(rows)} 条")
    ok = fail = 0

    for row_id, desc in rows:
        zh = translate(desc)
        if zh and zh != desc:
            db.execute("UPDATE events SET description_zh = ? WHERE id = ?", (zh, row_id))
            db.commit()
            ok += 1
            print(f"✓ [{row_id}] {zh[:60]}")
        else:
            fail += 1
            print(f"✗ [{row_id}] 跳过")
        time.sleep(1.5)  # rate limit friendly

    print(f"\n完成：✓{ok} ✗{fail}")
    db.close()

if __name__ == "__main__":
    main()
