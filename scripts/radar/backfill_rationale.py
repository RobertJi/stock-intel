"""One-off: fill missing rationale on sector_instruments using thesis context.

Usage: python -m scripts.radar.backfill_rationale
"""
from __future__ import annotations

import json
from typing import Any

from . import config, db, llm

SYSTEM = """给定一个板块论点(摘要与传导链)及其映射标的列表,为每个标的写 rationale:
受论点中哪一环影响、方向利好还是利空、以及为什么是该敏感度(营收占比/替代弹性等)。一句话,中文。
同时校正 relation(direct/upstream/downstream/competitor/customer/supplier/partner/proxy_etf)和 sensitivity(high/medium/low)。
只输出 JSON 数组:[{"symbol": "...", "market": "...", "relation": "...", "sensitivity": "...", "rationale": "..."}]"""


def main() -> None:
    db.require_env()
    theses = db.get(
        "sector_theses",
        "select=sector,sector_zh,direction,summary,transmission&status=in.(forming,active,confirmed)",
    )
    by_sector = {t["sector"]: t for t in theses}
    instruments = db.get("sector_instruments", "select=id,sector,market,symbol,name,relation,sensitivity&rationale=is.null")
    groups: dict[str, list[dict[str, Any]]] = {}
    for inst in instruments:
        groups.setdefault(inst["sector"], []).append(inst)

    for sector, insts in groups.items():
        thesis = by_sector.get(sector)
        if not thesis:
            continue
        user = (
            f"论点[{thesis.get('sector_zh') or sector} {thesis['direction']}]: {thesis.get('summary')}\n"
            f"传导链: {thesis.get('transmission')}\n\n标的:\n"
            + "\n".join(f"- {i['market']} {i['symbol']} {i.get('name') or ''} ({i['relation']}/{i['sensitivity']})" for i in insts)
        )
        try:
            result = llm.chat_json(config.REASON_MODEL, SYSTEM, user, max_tokens=2500)
        except Exception as e:  # noqa: BLE001
            print(f"  {sector} failed: {e}")
            continue
        by_key = {(r.get("market"), r.get("symbol")): r for r in result if isinstance(r, dict)}
        updated = 0
        for inst in insts:
            r = by_key.get((inst["market"], inst["symbol"]))
            if not r or not r.get("rationale"):
                continue
            patch = {"rationale": r["rationale"]}
            if r.get("relation"):
                patch["relation"] = r["relation"]
            if r.get("sensitivity") in ("high", "medium", "low"):
                patch["sensitivity"] = r["sensitivity"]
            db.update("sector_instruments", f"id=eq.{inst['id']}", patch)
            updated += 1
        print(f"{sector}: {updated}/{len(insts)} updated")


if __name__ == "__main__":
    main()
