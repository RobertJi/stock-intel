"""Sector Radar pipeline runner.

Usage:
    python -m scripts.radar.run [collect|triage|reason|score|alert|outcome|all] [--dry-run]
"""
from __future__ import annotations

import sys

from . import alert as alert_mod
from . import db, outcome, reason, score, synthesize, triage
from .collectors import benchmarks, events_bridge, hackernews, news_rss, price_moves, reddit

COLLECTORS = [news_rss, price_moves, benchmarks, events_bridge, reddit, hackernews]


def collect(dry_run: bool = False) -> None:
    total_new = 0
    for mod in COLLECTORS:
        name = mod.__name__.rsplit(".", 1)[-1]
        signals = mod.collect()
        if dry_run:
            print(f"collect[{name}]: {len(signals)} signals (dry-run, not stored)")
            for s in signals[:5]:
                print(f"  - {s['title']}")
            continue
        inserted = db.insert("radar_signals", signals, upsert_on="content_hash")
        total_new += len(inserted)
        print(f"collect[{name}]: {len(signals)} fetched, {len(inserted)} new")
    if not dry_run:
        print(f"collect: {total_new} new signals total")


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    mode = args[0] if args else "all"
    if not dry_run:
        db.require_env()

    steps = {
        "collect": lambda: collect(dry_run),
        "triage": lambda: triage.run(dry_run),
        "reason": lambda: reason.run(dry_run),
        "score": lambda: score.run(dry_run),
        "synthesize": lambda: synthesize.run(dry_run),
        "alert": lambda: alert_mod.run(dry_run),
        "outcome": lambda: outcome.run(dry_run),
    }
    if mode == "all":
        for name, fn in steps.items():
            print(f"== {name} ==")
            fn()
    elif mode in steps:
        steps[mode]()
    else:
        raise SystemExit(f"unknown mode: {mode} (expected {'/'.join(steps)}/all)")


if __name__ == "__main__":
    main()
