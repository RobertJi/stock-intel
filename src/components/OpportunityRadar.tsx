import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Eye, Radar } from "lucide-react";
import type { OpportunityData } from "@/lib/server-data";

const DIRECTION_CONFIG = {
  bullish: {
    label: "看多",
    icon: ArrowUpRight,
    edge: "before:bg-up",
    badge: "bg-up/10 text-up",
    iconTone: "text-up",
    barTone: "bg-up",
  },
  bearish: {
    label: "看空",
    icon: ArrowDownRight,
    edge: "before:bg-down",
    badge: "bg-down/10 text-down",
    iconTone: "text-down",
    barTone: "bg-down",
  },
  watch: {
    label: "观察",
    icon: Eye,
    edge: "before:bg-warn",
    badge: "bg-warn/10 text-warn",
    iconTone: "text-warn",
    barTone: "bg-warn",
  },
} as const;

function formatHorizon(value: string) {
  if (value === "days_to_weeks") return "数日-数周";
  if (value === "days") return "数日";
  if (value === "weeks") return "数周";
  return value.replaceAll("_", " ");
}

function topEvidence(opportunity: OpportunityData) {
  const evidence = opportunity.evidenceChain.find((item) => item.summary || item.title);
  return evidence?.summary || evidence?.title || opportunity.whyNow || "等待更多证据确认";
}

export function OpportunityRadar({ opportunities }: { opportunities: OpportunityData[] }) {
  if (opportunities.length === 0) {
    return null;
  }

  const topScore = Math.max(...opportunities.map((item) => item.score));

  return (
    <section className="mb-12">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Radar className="size-4 text-accent" />
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">
              Market Radar
            </p>
          </div>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            今日机会
          </h2>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <Activity className="size-4 text-accent" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Top Score <span className="num font-semibold text-foreground">{topScore}</span>
          </span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {opportunities.map((opportunity) => {
          const config = DIRECTION_CONFIG[opportunity.direction] ?? DIRECTION_CONFIG.watch;
          const Icon = config.icon;
          const risk = opportunity.risks[0] || opportunity.invalidationCondition || "等待后续信号验证";

          return (
            <article
              key={opportunity.id}
              className={
                "relative overflow-hidden rounded-xl border border-border bg-surface px-4 py-4 transition-colors hover:border-faint/40 before:absolute before:inset-y-0 before:left-0 before:w-[3px] " +
                config.edge
              }
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-[0.12em] text-foreground">
                      {opportunity.ticker ?? opportunity.sector ?? "THEME"}
                    </span>
                    <span className={"rounded px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider " + config.badge}>
                      {config.label}
                    </span>
                  </div>
                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                    {opportunity.title}
                  </h3>
                </div>
                <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-2">
                  <Icon className={"size-5 " + config.iconTone} />
                </div>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border bg-surface-2/60 px-2.5 py-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Score</p>
                  <p className="num mt-1 font-mono text-lg font-bold text-foreground">{opportunity.score}</p>
                  <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-background">
                    <div
                      className={"h-full " + config.barTone}
                      style={{ width: `${Math.min(100, opportunity.score)}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-surface-2/60 px-2.5 py-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Conf</p>
                  <p className="num mt-1 font-mono text-lg font-bold text-foreground">{opportunity.confidence}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface-2/60 px-2.5 py-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Window</p>
                  <p className="mt-1 truncate font-mono text-xs font-semibold text-foreground">
                    {formatHorizon(opportunity.timeHorizon)}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-accent">
                    Why Now
                  </p>
                  <p className="line-clamp-3 text-sm leading-relaxed text-foreground/85">
                    {opportunity.whyNow || topEvidence(opportunity)}
                  </p>
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5 text-warn" />
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-warn">
                      Risk
                    </p>
                  </div>
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {risk}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
