"""Deliver undelivered thesis alerts via notify (Feishu / Telegram)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from . import db, notify

MAX_AGE_HOURS = 48  # 更早的告警已失去时效:不补发,直接标记


def run(dry_run: bool = False) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=MAX_AGE_HOURS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    if not dry_run:
        stale = db.update("radar_alerts", f"delivered=eq.false&created_at=lt.{cutoff}&select=id", {"delivered": True})
        if stale:
            print(f"alert: {len(stale)} stale alerts skipped (older than {MAX_AGE_HOURS}h)")
    alerts = db.get("radar_alerts", "select=id,message&delivered=eq.false&order=created_at.asc&limit=20")
    if not alerts:
        print("alert: nothing to deliver")
        return
    if not notify.configured():
        print(f"alert: {len(alerts)} pending, no channel configured — kept for later")
        return
    sent = 0
    for a in alerts:
        if dry_run:
            print(f"  would send: {a['message'][:120]}")
            continue
        if notify.send(a["message"]):
            db.update("radar_alerts", f"id=eq.{a['id']}", {"delivered": True})
            sent += 1
    print(f"alert: {sent}/{len(alerts)} delivered")
