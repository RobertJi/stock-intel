"""Theme-level synthesis: overview, aggregate stance, and outlook per theme."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from . import config, db, llm

SYSTEM = """你是板块策略分析师。给定某个主题(板块大类)下的活跃论点(方向、conviction、摘要),输出:
1. intro: 一句话介绍该主题板块涵盖的范围与当前核心矛盾
2. stance: 你综合所有论点后的整体判断,bullish/bearish/mixed
3. stance_reason: 整体判断的理由,2-3 句,要引用具体论点间的相互印证或冲突
4. outlook: 趋势预测,未来数周可能的演化路径与关键观察点,2-3 句

写给人看:自然语言,不要出现 conviction=xx、bearish/bullish 等字段名和括号注记,提到论点直接用其中文名。

只输出一个 JSON 对象:
{"intro": "...", "stance": "bullish", "stance_reason": "...", "outlook": "..."}"""


def run(dry_run: bool = False) -> None:
    theses = db.get(
        "sector_theses",
        "select=theme,sector_zh,sector,direction,conviction,status,summary"
        "&status=in.(forming,active,confirmed)&order=conviction.desc",
    )
    if not theses:
        print("synthesize: no active theses")
        return

    groups: dict[str, list[dict[str, Any]]] = {}
    for t in theses:
        groups.setdefault(t.get("theme") or "其他", []).append(t)

    now = datetime.now(timezone.utc).isoformat()
    written = 0
    for theme, group in groups.items():
        lines = [f"主题:{theme}"]
        for t in group:
            label = t.get("sector_zh") or t.get("sector")
            lines.append(
                f"- [{t['direction']} conviction={t['conviction']} {t['status']}] {label}: {(t.get('summary') or '')[:120]}"
            )
        try:
            item = llm.chat_json(config.REASON_MODEL, SYSTEM, "\n".join(lines), max_tokens=1500)
        except Exception as e:  # noqa: BLE001
            print(f"  synthesize[{theme}] failed: {e}")
            continue
        if dry_run:
            print(theme, json.dumps(item, ensure_ascii=False)[:200])
            continue
        stance = item.get("stance") if isinstance(item, dict) else None
        row = {
            "theme": theme,
            "intro": item.get("intro"),
            "stance": stance if stance in ("bullish", "bearish", "mixed") else "mixed",
            "stance_reason": item.get("stance_reason"),
            "outlook": item.get("outlook"),
            "bullish_count": sum(1 for t in group if t["direction"] == "bullish"),
            "bearish_count": sum(1 for t in group if t["direction"] == "bearish"),
            "updated_at": now,
        }
        existing = db.get("radar_theme_overviews", f"select=id&theme=eq.{theme}&limit=1")
        if existing:
            db.update("radar_theme_overviews", f"id=eq.{existing[0]['id']}", row)
        else:
            db.insert("radar_theme_overviews", [row])
        written += 1
    print(f"synthesize: {written} theme overviews updated")
