import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Eye, Radar } from "lucide-react";
import type { OpportunityData } from "@/lib/server-data";

const DIRECTION_CONFIG = {
  bullish: {
    label: "看多",
    icon: ArrowUpRight,
    tone: "border-[#1B4332]/25 bg-[#1B4332]/[0.055]",
    badge: "bg-[#1B4332]/12 text-[#1B4332]",
    iconTone: "text-[#1B4332]",
  },
  bearish: {
    label: "看空",
    icon: ArrowDownRight,
    tone: "border-[#7C1D1D]/25 bg-[#7C1D1D]/[0.055]",
    badge: "bg-[#7C1D1D]/12 text-[#7C1D1D]",
    iconTone: "text-[#7C1D1D]",
  },
  watch: {
    label: "观察",
    icon: Eye,
    tone: "border-[#B5882B]/30 bg-[#B5882B]/[0.07]",
    badge: "bg-[#B5882B]/15 text-[#8A681F]",
    iconTone: "text-[#B5882B]",
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
    <section className="mb-10 border-b border-[#D4CCB8] pb-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Radar className="size-4 text-[#B5882B]" />
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B5882B]">
              Market Radar
            </p>
          </div>
          <h2 className="font-display text-3xl text-[#1A1A2E] sm:text-4xl">
            Today&apos;s Opportunities
          </h2>
        </div>
        <div className="flex items-center gap-2 rounded border border-[#D4CCB8] bg-[#EDE8DE]/60 px-3 py-2">
          <Activity className="size-4 text-[#B5882B]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C6E]">
            Top Score {topScore}
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
              className={"rounded-lg border px-4 py-4 " + config.tone}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold tracking-[0.18em] text-[#1A1A2E]">
                      {opportunity.ticker ?? opportunity.sector ?? "THEME"}
                    </span>
                    <span className={"rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider " + config.badge}>
                      {config.label}
                    </span>
                  </div>
                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[#1A1A2E]">
                    {opportunity.title}
                  </h3>
                </div>
                <div className="grid size-12 shrink-0 place-items-center rounded border border-[#D4CCB8]/80 bg-[#F5F1E8]/70">
                  <Icon className={"size-5 " + config.iconTone} />
                </div>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <div className="rounded border border-[#D4CCB8]/80 bg-[#F5F1E8]/55 px-2 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#5C5C6E]">Score</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-[#1A1A2E]">{opportunity.score}</p>
                </div>
                <div className="rounded border border-[#D4CCB8]/80 bg-[#F5F1E8]/55 px-2 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#5C5C6E]">Conf</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-[#1A1A2E]">{opportunity.confidence}</p>
                </div>
                <div className="rounded border border-[#D4CCB8]/80 bg-[#F5F1E8]/55 px-2 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#5C5C6E]">Window</p>
                  <p className="mt-1 truncate font-mono text-xs font-semibold text-[#1A1A2E]">
                    {formatHorizon(opportunity.timeHorizon)}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#B5882B]">
                    Why Now
                  </p>
                  <p className="line-clamp-3 text-xs leading-relaxed text-[#1A1A2E]">
                    {opportunity.whyNow || topEvidence(opportunity)}
                  </p>
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5 text-[#8A681F]" />
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A681F]">
                      Risk
                    </p>
                  </div>
                  <p className="line-clamp-2 text-xs leading-relaxed text-[#5C5C6E]">
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
