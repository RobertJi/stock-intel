"""Sector Radar configuration."""
import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN", "")

# 设置了 REPLICATE_API_TOKEN 则优先走 Replicate,否则 OpenRouter
LLM_PROVIDER = os.environ.get("RADAR_LLM_PROVIDER") or ("replicate" if REPLICATE_API_TOKEN else "openrouter")

# 便宜模型做分诊,强模型做传导链推理(注意两家的模型 ID 命名不同)
_DEFAULT_MODELS = {
    "replicate": ("anthropic/claude-4.5-haiku", "anthropic/claude-4.5-sonnet"),
    "openrouter": ("anthropic/claude-haiku-4.5", "anthropic/claude-sonnet-4.5"),
}
TRIAGE_MODEL = os.environ.get("RADAR_TRIAGE_MODEL", _DEFAULT_MODELS[LLM_PROVIDER][0])
REASON_MODEL = os.environ.get("RADAR_REASON_MODEL", _DEFAULT_MODELS[LLM_PROVIDER][1])

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# 论点状态机阈值
ACTIVATE_CONVICTION = 55
ACTIVATE_MIN_EVIDENCE = 2
CONVICTION_JUMP_ALERT = 15
THESIS_EXPIRE_DAYS = 7

# 分诊批大小 / 推理单次上限(控制成本)
TRIAGE_BATCH = 25
REASON_MAX_PER_RUN = 30

# 板块新闻订阅关键词(Google News RSS query)。新增板块只需加一行。
NEWS_TOPICS: dict[str, str] = {
    "memory-semiconductors": "DRAM NAND memory chip price",
    "ai-models": "AI model benchmark LLM release",
    "semiconductors": "semiconductor foundry chip",
    "ev-battery": "EV battery lithium price",
    "energy": "oil gas OPEC supply",
    "macro-cn": "中国 政策 刺激 央行",
}

# price_move 采集器监控的先行指标池:{symbol: (name, sector_hint)}
LEADING_TICKERS: dict[str, tuple[str, str]] = {
    "MU": ("Micron", "memory-semiconductors"),
    "000660.KS": ("SK Hynix", "memory-semiconductors"),
    "005930.KS": ("Samsung Electronics", "memory-semiconductors"),
    "SOXX": ("iShares Semiconductor ETF", "semiconductors"),
    "NVDA": ("NVIDIA", "semiconductors"),
    "CL=F": ("WTI Crude", "energy"),
    "HG=F": ("Copper Futures", "industrial-metals"),
    "LIT": ("Global X Lithium ETF", "ev-battery"),
    "KWEB": ("KraneShares China Internet", "china-internet"),
}
PRICE_MOVE_THRESHOLD_PCT = 4.0  # 单日涨跌幅超过该值即产生 price_move 信号

# Reddit 社媒信号:监控的 subreddit 与热度门槛
REDDIT_SUBS = ["stocks", "investing", "hardware", "LocalLLaMA", "semiconductors"]
HN_MIN_POINTS = 150
