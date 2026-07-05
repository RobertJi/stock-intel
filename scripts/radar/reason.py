"""Strong-model reasoning: infer transmission chains, attach signals to theses."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from . import config, db, llm

THEMES = ["AI与半导体", "新能源与电动车", "能源与大宗", "消费与互联网", "医药健康", "金融地产", "宏观与政策", "其他"]

SYSTEM = """你是市场传导链分析师。给定一批新信号和当前活跃的板块论点,对每条信号推断:
1. 它影响哪些板块(用 kebab-case slug,如 memory-semiconductors),方向 bullish/bearish,并给出所属主题 theme(必须从这个列表选:AI与半导体/新能源与电动车/能源与大宗/消费与互联网/医药健康/金融地产/宏观与政策/其他)
2. 传导链:一步步因果(如 "DRAM合约价+10% → 存储原厂毛利改善 → 存储板块盈利上修")
3. 证据强度 weight 0-100(独家硬数据高分,模糊传闻低分)
4. 归属:若与某活跃论点是同一判断,给出其 thesis_id;否则 thesis_id 为 null(新建)
5. 新建论点时给出 sector_zh、summary、confirm_conditions、invalidate_conditions、以及各市场(US/HK/CN/JP/KR)可表达该判断的标的 instruments(每个市场最多 2 个,保持输出紧凑)

只输出 JSON 数组,每项:
{"signal_idx": <编号>, "impacts": [{"sector": "...", "sector_zh": "...", "theme": "AI与半导体", "direction": "bullish", "thesis_id": null 或 "uuid",
  "transmission": "...", "weight": 0-100, "stance": "supports"|"weakens", "reasoning": "...",
  "summary": "...", "confirm_conditions": ["..."], "invalidate_conditions": ["..."],
  "instruments": [{"market": "US", "symbol": "MU", "name": "Micron", "relation": "direct|upstream|downstream|competitor|customer|supplier|partner|proxy_etf", "sensitivity": "high|medium|low", "rationale": "必须说清:受论点中哪一环影响、影响方向(利好/利空)、以及为什么是这个敏感度(如营收占比/替代弹性)"}]}]}
无板块影响的信号输出 "impacts": []。"""


def run(dry_run: bool = False, mock: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    if mock is not None:
        signals = mock["signals"]
        theses = mock.get("theses", [])
    else:
        signals = db.get(
            "radar_signals",
            "select=id,title,content,source_kind,url,published_at"
            "&triage_status=eq.interesting&reason_status=eq.pending"
            f"&order=created_at.asc&limit={config.REASON_MAX_PER_RUN}",
        )
        theses = db.get(
            "sector_theses",
            "select=id,sector,sector_zh,direction,summary,conviction"
            "&status=in.(forming,active,confirmed)",
        )
    if not signals:
        print("reason: nothing to process")
        return []

    known_thesis_ids = {t["id"] for t in theses}
    all_analyses: list[dict[str, Any]] = []
    chunk_size = config.REASON_CHUNK
    for start in range(0, len(signals), chunk_size):
        chunk = signals[start : start + chunk_size]
        # 每个分块都重新取论点上下文,分块间新建的论点也能被归属
        thesis_ctx = json.dumps(
            [{k: t[k] for k in ("id", "sector", "direction", "summary")} for t in theses],
            ensure_ascii=False,
        )
        signal_lines = [
            f'{i}. [{s["source_kind"]}] {s["title"]}\n   {(s.get("content") or "")[:300]}'
            for i, s in enumerate(chunk)
        ]
        user = f"当前活跃论点:\n{thesis_ctx}\n\n新信号:\n" + "\n".join(signal_lines)
        try:
            analyses = llm.chat_json(config.REASON_MODEL, SYSTEM, user, max_tokens=8000)
        except Exception as e:  # noqa: BLE001
            print(f"  reason chunk failed ({start}-{start + len(chunk)}): {e}")
            continue
        all_analyses.extend(a for a in analyses if isinstance(a, dict))

        if dry_run:
            print(json.dumps(analyses, ensure_ascii=False, indent=2))
            continue

        by_idx = {a.get("signal_idx"): a for a in analyses if isinstance(a, dict)}
        for i, sig in enumerate(chunk):
            analysis = by_idx.get(i, {"impacts": []})
            try:
                _apply(sig, analysis.get("impacts") or [], known_thesis_ids)
                db.update("radar_signals", f"id=eq.{sig['id']}", {"reason_status": "done"})
            except Exception as e:  # noqa: BLE001
                print(f"  reason apply failed for {sig['id']}: {e}")
                db.update("radar_signals", f"id=eq.{sig['id']}", {"reason_status": "failed"})
        if not dry_run:
            theses = db.get(
                "sector_theses",
                "select=id,sector,sector_zh,direction,summary,conviction&status=in.(forming,active,confirmed)",
            )
            known_thesis_ids = {t["id"] for t in theses}
    print(f"reason: {len(signals)} signals processed")
    return all_analyses


def _apply(sig: dict[str, Any], impacts: list[dict[str, Any]], known_thesis_ids: set[str]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    for imp in impacts:
        sector = imp.get("sector")
        direction = imp.get("direction")
        if not sector or direction not in ("bullish", "bearish"):
            continue
        thesis_id = imp.get("thesis_id")
        if thesis_id not in known_thesis_ids:
            thesis_id = None
        if thesis_id is None:
            existing = db.get(
                "sector_theses",
                f"select=id&sector=eq.{sector}&direction=eq.{direction}&status=in.(forming,active,confirmed)&limit=1",
            )
            if existing:
                thesis_id = existing[0]["id"]
        if thesis_id is None:
            rows = db.insert(
                "sector_theses",
                [{
                    "sector": sector,
                    "sector_zh": imp.get("sector_zh"),
                    "theme": imp.get("theme") if imp.get("theme") in THEMES else "其他",
                    "direction": direction,
                    "status": "forming",
                    "summary": imp.get("summary") or imp.get("reasoning"),
                    "transmission": imp.get("transmission"),
                    "confirm_conditions": imp.get("confirm_conditions") or [],
                    "invalidate_conditions": imp.get("invalidate_conditions") or [],
                    "first_signal_at": sig.get("published_at") or now,
                    "last_signal_at": now,
                }],
            )
            if not rows:
                continue
            thesis_id = rows[0]["id"]
            known_thesis_ids.add(thesis_id)
            instruments = [
                {
                    "sector": sector,
                    "market": inst.get("market"),
                    "symbol": inst.get("symbol"),
                    "name": inst.get("name"),
                    "relation": inst.get("relation") or "direct",
                    "sensitivity": inst.get("sensitivity") or "medium",
                    "rationale": inst.get("rationale"),
                }
                for inst in (imp.get("instruments") or [])
                if inst.get("market") and inst.get("symbol")
            ]
            db.insert("sector_instruments", instruments, upsert_on="sector,market,symbol")
        else:
            db.update(
                "sector_theses",
                f"id=eq.{thesis_id}",
                {"last_signal_at": now, "transmission": imp.get("transmission"), "updated_at": now},
            )
        db.insert(
            "thesis_signals",
            [{
                "thesis_id": thesis_id,
                "signal_id": sig["id"],
                "stance": imp.get("stance") or "supports",
                "weight": int(imp.get("weight") or 50),
                "reasoning": imp.get("reasoning"),
            }],
            upsert_on="thesis_id,signal_id",
        )
