"""Outbound notifications: Feishu (飞书群机器人) first, Telegram as fallback.

FEISHU_WEBHOOK_URL      群机器人 webhook
FEISHU_WEBHOOK_SECRET   可选,机器人开启"签名校验"时填写
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time

import requests

from . import config


def send(text: str) -> bool:
    """Send a plain-text message to every configured channel. True if any succeeded."""
    ok = False
    if config.FEISHU_WEBHOOK_URL:
        ok = _feishu(text) or ok
    if config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID:
        ok = _telegram(text) or ok
    if not config.FEISHU_WEBHOOK_URL and not config.TELEGRAM_BOT_TOKEN:
        print(f"  notify (no channel configured): {text[:160]}")
        return True
    return ok


def _feishu(text: str) -> bool:
    payload: dict = {"msg_type": "text", "content": {"text": text}}
    secret = os.environ.get("FEISHU_WEBHOOK_SECRET", "")
    if secret:
        ts = str(int(time.time()))
        digest = hmac.new(f"{ts}\n{secret}".encode(), b"", hashlib.sha256).digest()
        payload.update({"timestamp": ts, "sign": base64.b64encode(digest).decode()})
    try:
        r = requests.post(config.FEISHU_WEBHOOK_URL, json=payload, timeout=15)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        return r.ok and body.get("code", 0) == 0
    except Exception as e:  # noqa: BLE001
        print(f"  feishu send failed: {e}")
        return False


def _telegram(text: str) -> bool:
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": config.TELEGRAM_CHAT_ID, "text": text},
            timeout=15,
        )
        return r.ok
    except Exception as e:  # noqa: BLE001
        print(f"  telegram send failed: {e}")
        return False
