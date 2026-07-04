"""Deliver undelivered alerts via Telegram (if configured)."""
from __future__ import annotations

import requests

from . import config, db


def run(dry_run: bool = False) -> None:
    alerts = db.get("radar_alerts", "select=id,message&delivered=eq.false&order=created_at.asc&limit=20")
    if not alerts:
        print("alert: nothing to deliver")
        return
    for a in alerts:
        if dry_run:
            print(f"  would send: {a['message'][:120]}")
            continue
        ok = _send_telegram(a["message"]) if config.TELEGRAM_BOT_TOKEN else True
        if ok:
            db.update("radar_alerts", f"id=eq.{a['id']}", {"delivered": True})
    print(f"alert: {len(alerts)} processed")


def _send_telegram(message: str) -> bool:
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": config.TELEGRAM_CHAT_ID, "text": message},
            timeout=15,
        )
        return r.ok
    except Exception as e:  # noqa: BLE001
        print(f"  telegram send failed: {e}")
        return False
