"""Cheap-model triage: discard noise, tag sector guesses."""
from __future__ import annotations

import json
from typing import Any

from . import config, db, llm

SYSTEM = """你是市场情报分诊员。判断每条信息是否可能预示某个股票板块的重大变动(涨价周期、需求突变、政策转向、技术突破、供给冲击等)。
个股日常新闻、泛泛的大盘评论、荐股软文、旧闻复述一律 discard。
只输出 JSON 数组,每项: {"idx": <编号>, "verdict": "interesting"|"discard", "sectors": ["board-slug", ...]}"""


def run(dry_run: bool = False, mock_signals: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    if mock_signals is not None:
        pending = mock_signals
    else:
        pending = db.get(
            "radar_signals",
            f"select=id,title,content,source_kind&triage_status=eq.pending&order=created_at.asc&limit={config.TRIAGE_BATCH * 4}",
        )
    if not pending:
        print("triage: nothing pending")
        return []

    results: list[dict[str, Any]] = []
    for i in range(0, len(pending), config.TRIAGE_BATCH):
        batch = pending[i : i + config.TRIAGE_BATCH]
        lines = [
            f'{j}. [{s["source_kind"]}] {s["title"]} | {(s.get("content") or "")[:150]}'
            for j, s in enumerate(batch)
        ]
        verdicts = llm.chat_json(config.TRIAGE_MODEL, SYSTEM, "\n".join(lines))
        by_idx = {v.get("idx"): v for v in verdicts if isinstance(v, dict)}
        for j, sig in enumerate(batch):
            v = by_idx.get(j, {"verdict": "discard", "sectors": []})
            verdict = "interesting" if v.get("verdict") == "interesting" else "discarded"
            sectors = v.get("sectors") or []
            results.append({"id": sig.get("id"), "title": sig["title"], "verdict": verdict, "sectors": sectors})
            if not dry_run and sig.get("id"):
                db.update(
                    "radar_signals",
                    f"id=eq.{sig['id']}",
                    {"triage_status": verdict, "triage_sectors": sectors},
                )
    kept = sum(1 for r in results if r["verdict"] == "interesting")
    print(f"triage: {len(results)} processed, {kept} interesting")
    if dry_run:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    return results
