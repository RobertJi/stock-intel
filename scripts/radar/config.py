"""Sector Radar configuration."""
import os
from pathlib import Path


def _load_dotenv() -> None:
    """本地调试:从仓库根目录 .env / .env.local 加载环境变量(已设置的不覆盖)。"""
    root = Path(__file__).resolve().parents[2]
    for name in (".env", ".env.local"):
        path = root / name
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN", "")
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

# 模型通道按顺序容灾:主通道失败(余额不足/超时/5xx)自动切到下一家。
# RADAR_LLM_PROVIDER 可强制指定主通道;其余已配置 key 的通道作为备份。
_AVAILABLE = [
    name
    for name, key in (
        ("deepseek", DEEPSEEK_API_KEY),
        ("openrouter", OPENROUTER_API_KEY),
        ("replicate", REPLICATE_API_TOKEN),
    )
    if key
]
_PRIMARY = os.environ.get("RADAR_LLM_PROVIDER")
LLM_PROVIDERS: list[str] = (
    [_PRIMARY] + [p for p in _AVAILABLE if p != _PRIMARY] if _PRIMARY else _AVAILABLE
)
LLM_PROVIDER = LLM_PROVIDERS[0] if LLM_PROVIDERS else "deepseek"

# 每家的 (分诊模型, 推理模型)。DeepSeek 的 API 模型 ID 是 deepseek-flash(即 V4.1-Flash)。
PROVIDER_MODELS: dict[str, tuple[str, str]] = {
    "deepseek": (
        os.environ.get("DEEPSEEK_TRIAGE_MODEL", "deepseek-flash"),
        os.environ.get("DEEPSEEK_REASON_MODEL", "deepseek-flash"),
    ),
    "replicate": ("anthropic/claude-4.5-haiku", "anthropic/claude-4.5-sonnet"),
    "openrouter": ("anthropic/claude-haiku-4.5", "anthropic/claude-sonnet-4.5"),
}
# 逻辑档位:调用方只说要"triage"还是"reason",具体模型由通道决定
TRIAGE_MODEL = "triage"
REASON_MODEL = "reason"

# 积压保护:超过该时长仍未处理的信号直接标记过期,不再消耗模型额度
MAX_SIGNAL_AGE_HOURS = int(os.environ.get("RADAR_MAX_SIGNAL_AGE_HOURS", "48"))

# 告警与心跳
FEISHU_WEBHOOK_URL = os.environ.get("FEISHU_WEBHOOK_URL", "")
HEALTHCHECK_PING_URL = os.environ.get("HEALTHCHECK_PING_URL", "")  # 如 healthchecks.io,外部死信开关
STALE_ALERT_HOURS = int(os.environ.get("RADAR_STALE_ALERT_HOURS", "14"))

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# 论点状态机阈值
ACTIVATE_CONVICTION = 55
ACTIVATE_MIN_EVIDENCE = 2
CONVICTION_JUMP_ALERT = 15
JUMP_ALERT_MIN_CONVICTION = 60  # 信心分跳升只有在达到该水位时才推送
ALERT_COOLDOWN_HOURS = 48  # 同一论点两次推送的最短间隔
THESIS_EXPIRE_DAYS = 7

# 分诊批大小 / 推理单次上限(控制成本)
TRIAGE_BATCH = 25
REASON_MAX_PER_RUN = 30
REASON_CHUNK = 8  # 每次 LLM 调用处理的信号数,过大会导致输出 JSON 被 max_tokens 截断

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
