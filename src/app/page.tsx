import { fetchEvents, fetchTheses, fetchThemeOverviews } from "@/lib/server-data";
import { EventsFeed } from "@/components/EventsFeed";
import { ThesisPanel } from "@/components/ThesisPanel";
import { AlertTriangle, DatabaseZap } from "lucide-react";

export const revalidate = 60;

export default async function Home() {
  const [eventsResult, thesesResult, overviewsResult] = await Promise.allSettled([
    fetchEvents(),
    fetchTheses(),
    fetchThemeOverviews(),
  ]);

  const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
  const theses = thesesResult.status === "fulfilled" ? thesesResult.value : [];
  const overviews = overviewsResult.status === "fulfilled" ? overviewsResult.value : {};
  const hasDataError =
    eventsResult.status === "rejected" || thesesResult.status === "rejected";
  const isEmpty = events.length === 0 && theses.length === 0;

  const bullCount = theses.filter((t) => t.direction === "bullish").length;
  const bearCount = theses.filter((t) => t.direction === "bearish").length;
  const themeCount = new Set(theses.map((t) => t.theme || "其他")).size;
  const bullishEvents = events.filter((e) => e.impact === "BULLISH").length;
  const bearishEvents = events.filter((e) => e.impact === "BEARISH").length;

  const stats = [
    { label: "主题", value: themeCount, tone: "text-foreground" },
    { label: "论点", value: theses.length, tone: "text-foreground" },
    { label: "看多", value: bullCount, tone: "text-up" },
    { label: "看空", value: bearCount, tone: "text-down" },
    { label: "信号", value: events.length, tone: "text-foreground" },
    { label: "利多 / 利空", value: `${bullishEvents}/${bearishEvents}`, tone: "text-accent" },
  ];

  return (
    <div className="w-full">
      <div className="mb-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-accent">
              Signal Intelligence
            </p>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Sector Radar
            </h1>
          </div>
          {!isEmpty && (
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-6">
              {stats.map((s) => (
                <div key={s.label} className="bg-surface px-4 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
                    {s.label}
                  </p>
                  <p className={`num mt-1 font-mono text-xl font-semibold ${s.tone}`}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {hasDataError && (
        <div className="mb-6 rounded-xl border border-warn/25 bg-warn/[0.06] px-4 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-warn">Data Warning</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                部分数据暂时读取失败，页面先展示可用内容。请稍后刷新，或检查同步脚本/数据库连接。
              </p>
            </div>
          </div>
        </div>
      )}

      {isEmpty ? (
        <div className="mb-10 rounded-2xl border border-dashed border-border bg-surface/50 px-5 py-14 text-center">
          <DatabaseZap className="mx-auto mb-3 size-6 text-accent" />
          <p className="font-display text-2xl font-medium text-foreground">暂无可展示的市场数据</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            论点和信息流还没有返回结果。确认雷达管道运行完成后，刷新页面即可看到板块雷达。
          </p>
        </div>
      ) : (
        <div id="radar">
          <ThesisPanel theses={theses} overviews={overviews} />
        </div>
      )}

      <div id="information" className="scroll-mt-6">
        <div className="mb-5 flex items-end justify-between border-b border-border pb-4">
          <div>
            <p className="mb-1 font-mono text-xs uppercase tracking-[0.3em] text-accent">
              Evidence Feed
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              信息流
            </h2>
          </div>
          <p className="num font-mono text-xs text-faint">{events.length} 条信号</p>
        </div>
        <EventsFeed events={events} />
      </div>
    </div>
  );
}
