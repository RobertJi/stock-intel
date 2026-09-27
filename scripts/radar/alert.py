"""Deliver undelivered thesis alerts via notify (Feishu / Telegram)."""
from __future__ import annotations

from . import db, notify


def run(dry_run: bool = False) -> None:
    alerts = db.get("radar_alerts", "select=id,message&delivered=eq.false&order=created_at.asc&limit=20")
    if not alerts:
        print("alert: nothing to deliver")
        return
    for a in alerts:
        if dry_run:
            print(f"  would send: {a['message'][:120]}")
            continue
        if notify.send(a["message"]):
            db.update("radar_alerts", f"id=eq.{a['id']}", {"delivered": True})
    print(f"alert: {len(alerts)} processed")
