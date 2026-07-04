# Sector Radar 设计(v2 情报层)

Last updated: 2026-07-04

本文档替代 `docs/market-radar-design.md` 中的情报层设计(source_items → extracted_insights → opportunities 三层结构废弃)。行情/事件采集脚本与前端应用保留。

## 1. 产品目标

从蛛丝马迹中提前发现"某个板块即将发生重大变动"。

典型案例:

- 内存现货/合约价上涨 → 存储板块要涨(海力士、三星、MU、WDC、兆易创新……)
- 新模型评测高分(GLM-5.2 登顶)→ 相关公司股价大涨(智谱概念、算力链)
- 政策风向、供给侧事故、上游原料涨价、社媒讨论热度突变……

核心洞察:**板块是第一公民,个股是第二步**。系统先回答"存储要涨",再回答"美股/港股/日韩哪些标的能表达这个判断、哪些市场已经反应、哪些还没有"。

时效要求:半天级(每天两次,亚洲盘前 + 美股盘前)。以周为单位的信号没有价值。

传导链知识:**全自动 LLM 推断**,不预建知识图谱,不需要人工确认。LLM 每次从信号本身推断"这会传导到哪些板块、方向如何、为什么"。

## 2. 与 v1 的差异

| | v1 (market radar) | v2 (sector radar) |
|---|---|---|
| 组织单位 | 逐条 event 的 insight | 板块论点 (thesis) |
| 传导链 | 无,只有主题标签 | LLM 显式推断因果链 |
| 评分对象 | 单条 opportunity | 论点的证据集合,多信号互证 |
| 时效 | 天级 | 小时级 |
| 输出 | opportunity 列表 | 告警 + 板块论点面板 + 已反应/未反应市场对比 |

## 3. 核心对象

### Signal(信号)

一条原始观察,来自任何来源,归一化为统一形状:

```
signal {
  source_kind      -- news | social | search_trend | price_move | benchmark | filing | macro
  title, content, url, published_at
  entities         -- 采集器能识别的实体(可为空)
  raw              -- 原始 payload (jsonb)
  content_hash     -- 去重
}
```

采集器只负责"看到了什么",不做任何判断。

### SectorThesis(板块论点)

系统的输出单位。例:"存储板块进入涨价周期,方向看多"。

```
thesis {
  sector           -- 规范化板块名(LLM 归一,如 "memory-semiconductors")
  sector_zh        -- 中文展示名("存储芯片")
  direction        -- bullish | bearish
  status           -- forming | active | confirmed | invalidated | expired
  conviction       -- 0-100,由证据聚合计算,可审计
  summary          -- LLM 生成的当前论点摘要(随新证据更新)
  transmission     -- 传导链说明:"DRAM 合约价 +10% → 存储原厂毛利改善 → ..."
  confirm_conditions / invalidate_conditions
  first_signal_at, last_signal_at, expires_at
}
```

同一板块+方向只有一个活跃论点;新信号追加证据而不是新建论点。论点有生命周期,长期无新证据自动 expired。

### Evidence(论点-信号关联)

```
thesis_signal {
  thesis_id, signal_id
  stance           -- supports | weakens
  weight           -- 0-100,LLM 给出的该证据强度
  reasoning        -- 为什么这条信号支持/削弱论点
}
```

### InstrumentMap(板块→标的映射)

LLM 按需生成、缓存复用:

```
sector_instrument {
  sector, market    -- US | HK | CN | JP | KR
  symbol, name
  relation          -- direct | upstream | downstream | proxy_etf
  sensitivity       -- high | medium | low
}
```

### ThesisOutcome(结果回溯)

论点 active 后 T+1 / T+5 / T+20 记录映射标的的实际涨跌,用于校准信号质量与"哪个市场反应最快/最好"。

## 4. 管道

```
collect → triage(便宜LLM) → reason(强LLM) → aggregate/score → alert
   ↑                                                    ↓
   └──────────── outcome tracking(反馈校准)←────────────┘
```

### 4.1 collect(采集)

每个来源一个 adapter,输出统一 Signal。初始来源(按性价比排序):

1. **news**: Google News RSS 按板块关键词订阅(免key、分钟级更新)+ 现有 Yahoo news
2. **price_move**: 上游/先行指标价格异动 — 存储现货指数代理(MU/SK海力士/SOXX 等 ETF 与个股异动)、大宗商品期货、汇率;由现有 prices 数据 + yfinance 扩展标的池生成"异动信号"(单日 |Δ| 超阈值)
3. **benchmark**: LMArena / HuggingFace 榜单变化(HF API 免key)
4. **filing**: 现有 SEC events / Form 4 复用为信号源
5. **social / search_trend**: 二期。X API 贵、爬取脆;先用 Reddit RSS + Google Trends(pytrends)试水

关键设计:**adapter 极薄**,10-50 行一个,失败互不影响。新来源只需产出 Signal 形状。

### 4.2 triage(分诊,便宜模型)

批量把新信号丢给便宜 LLM(如 gemini-flash 级),问一个问题:"这条信息是否可能预示某个板块的重大变动?" 输出 discard / interesting + 初步板块猜测。目标是把 95% 的噪音在这里挡掉,控制强模型成本。

### 4.3 reason(推理,强模型)

对通过分诊的信号,强 LLM 输出结构化 JSON:

- 影响哪些板块、方向、置信度
- **传导链**:一步步的因果说明
- 时滞估计(立即 / 数日 / 数周)
- 确认条件与失效条件
- 与现有活跃论点的关系(归属已有论点 / 新建论点)

reason 阶段会带上当前活跃论点列表作为上下文,让 LLM 做归属判断,避免论点碎片化。

### 4.4 aggregate / score(聚合评分)

论点 conviction 不是黑盒,由可审计分量合成:

```
conviction = f(
  evidence_count_independent,   -- 独立来源互证数(同一新闻转载只算一次)
  max_single_weight,            -- 最强单条证据
  source_diversity,             -- 来源类型多样性(news+price+benchmark 强于 3条news)
  recency_decay,                -- 时间衰减
  priced_in_penalty             -- 已反应折扣:映射标的近期已大涨则降分
)
```

**priced_in 检查是关键差异化**:用行情数据核对"该板块各市场标的近 N 日涨跌",输出"韩股已反应 +12%,美股 MU 仅 +2%,A股链尚未动"这类对比 — 这正是可操作的信息。

状态机:forming(1条证据)→ active(conviction ≥ 55 或 ≥2 独立证据)→ confirmed / invalidated(确认/失效条件触发或结果回溯判定)→ expired(7 天无新证据)。

### 4.5 alert(告警)

- 论点进入 active、conviction 跳升 ≥15、或方向反转时触发
- 渠道:Telegram Bot(设 `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` 即启用),同时写 alerts 表供前端展示
- 告警内容:板块、方向、conviction、传导链一句话、各市场反应对比、证据链接

### 4.6 outcome(回溯)

每日任务:对 active/confirmed 论点记录映射标的 T+1/T+5/T+20 收益。月度可生成校准报告:哪类来源的信号命中率高、哪个市场对哪类板块反应最快。

## 5. 调度

GitHub Actions:

- `radar.yml` 每天两次(亚洲盘前 + 美股盘前):collect → triage → reason → score → alert → outcome(单次运行增量处理,幂等)
- 复用现有 `sync.yml` 的行情采集;price_move adapter 读取已同步行情
- 成本控制:triage 用便宜模型批处理;reason 只处理分诊通过者,预计每天 <100 次强模型调用

## 6. 前端(后续切片)

首页改为论点面板:活跃论点按 conviction 排序,每个论点展开显示传导链、证据时间线、各市场标的反应对比。本次先做管道,UI 单独一个 issue。

## 7. 目录结构

```
scripts/radar/
  __init__.py
  config.py          -- 环境变量、模型选择、阈值
  db.py              -- Supabase REST 薄封装
  models.py          -- Signal/Thesis dataclass
  collectors/
    news_rss.py      -- Google News RSS 板块关键词
    price_moves.py   -- 标的池异动检测
    benchmarks.py    -- HF 榜单
    events_bridge.py -- 复用现有 events/form4
  triage.py
  reason.py
  score.py
  alert.py
  run.py             -- CLI: python -m scripts.radar.run [collect|triage|reason|score|alert|all] [--dry-run]
supabase/migrations/002_sector_radar.sql
.github/workflows/radar.yml
```

## 8. 风险与取舍

- **LLM 幻觉传导链**:接受一定误报,靠多信号互证 + priced_in 检查 + outcome 回溯校准兜底;每条推理保留原文,可人工复核
- **社媒源缺失**:MVP 用 news+price+benchmark 三类,已覆盖"内存涨价""模型评分"两个典型案例;social 二期补
- **重复告警疲劳**:论点归属机制 + 告警只在状态变化时触发
- **成本**:分诊层挡噪音;OpenRouter 上便宜模型批处理,预算每月 <$10
