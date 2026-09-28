import Image from "next/image";
import Link from "next/link";
import { Briefcase, CalendarClock, Crosshair, Landmark, Radar, Settings, Zap } from "lucide-react";
import { getPipelineHealth, getThemeNav, type PipelineHealth, type ThemeNavItem } from "@/lib/db";
import { fmtAgo, freshnessLevel } from "@/lib/utils";
import { themeAnchor } from "@/lib/anchors";

const nav = [
  { label: "持仓录入", en: "Book", href: "/portfolio", icon: Briefcase },
  { label: "财报日历", en: "Earnings", href: "/earnings", icon: CalendarClock },
  { label: "雷达回溯", en: "Record", href: "/backtest", icon: Crosshair },
];

export async function Sidebar() {
  let themes: ThemeNavItem[] = [];
  let health: PipelineHealth | null = null;
  const [navResult, healthResult] = await Promise.allSettled([getThemeNav(), getPipelineHealth()]);
  if (navResult.status === "fulfilled") themes = navResult.value;
  if (healthResult.status === "fulfilled") health = healthResult.value;
  const level = freshnessLevel(health?.lastSuccessAt);
  const tone = {
    fresh: { box: "border-up/20 bg-up/[0.06]", dot: "bg-up", text: "text-up", label: "情报已更新" },
    lagging: { box: "border-warn/25 bg-warn/[0.06]", dot: "bg-warn", text: "text-warn", label: "情报滞后" },
    stale: { box: "border-down/30 bg-down/[0.08]", dot: "bg-down", text: "text-down", label: "情报管道停摆" },
  }[level];

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-surface/60 px-4 pb-6 pt-8 backdrop-blur lg:flex">
      <div className="mb-6 px-2">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg border border-accent/30 bg-accent/10">
            <Image src="/egret-dark.svg" alt="egret" width={22} height={22} />
          </div>
          <div>
            <h1 className="font-display text-base font-semibold leading-tight tracking-tight text-foreground">
              Stock Intel
            </h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-faint">
              Signal Terminal
            </p>
          </div>
        </div>
        <div
          className={"rounded-md border px-2.5 py-1.5 " + tone.box}
          title={health?.lastError ? `最近一次运行报错:${health.lastError}` : undefined}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex size-1.5">
              {level === "fresh" && (
                <span className={"absolute inline-flex size-full animate-ping rounded-full opacity-60 " + tone.dot} />
              )}
              <span className={"relative inline-flex size-1.5 rounded-full " + tone.dot} />
            </span>
            <span className={"text-xs font-medium " + tone.text}>{tone.label}</span>
          </div>
          <p className="mt-0.5 pl-3.5 font-mono text-[11px] text-faint">
            {health?.lastSuccessAt ? `${fmtAgo(health.lastSuccessAt)}` : "无运行记录"}
            {health?.lastStatus && health.lastStatus !== "ok" ? ` · 上次${health.lastStatus === "failed" ? "失败" : "部分失败"}` : ""}
          </p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pb-2">
        <Link
          href="/"
          className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Zap className="size-4 text-faint transition-colors group-hover:text-accent" />
          <span className="flex-1">波段机会</span>
          <span className="font-mono text-[11px] uppercase tracking-widest text-faint">
            Swing
          </span>
        </Link>
        <Link
          href="/value"
          className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Landmark className="size-4 text-faint transition-colors group-hover:text-accent" />
          <span className="flex-1">组合与观察池</span>
          <span className="font-mono text-[11px] uppercase tracking-widest text-faint">
            Value
          </span>
        </Link>
        <Link
          href="/radar"
          className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Radar className="size-4 text-faint transition-colors group-hover:text-accent" />
          <span className="flex-1">板块雷达 · 选题</span>
          <span className="font-mono text-[11px] uppercase tracking-widest text-faint">
            Radar
          </span>
        </Link>

        {/* 板块巡航导航 */}
        {themes.length > 0 && (
          <div className="ml-[1.4rem] space-y-0.5 border-l border-border py-1 pl-3">
            {themes.map(({ theme, bull, bear }) => (
              <Link
                key={theme}
                href={`/radar#${themeAnchor(theme)}`}
                className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <span className="truncate">{theme}</span>
                <span className="num shrink-0 font-mono text-[11px]">
                  {bull > 0 && <span className="text-up">{bull}多</span>}
                  {bull > 0 && bear > 0 && <span className="text-faint"> </span>}
                  {bear > 0 && <span className="text-down">{bear}空</span>}
                </span>
              </Link>
            ))}
          </div>
        )}

        {nav.map(({ label, en, href, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Icon className="size-4 text-faint transition-colors group-hover:text-accent" />
            <span className="flex-1">{label}</span>
            <span className="font-mono text-[11px] uppercase tracking-widest text-faint">
              {en}
            </span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto space-y-3 pt-3">
        <Link
          href="/settings"
          className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Settings className="size-4 text-faint transition-colors group-hover:text-accent" />
          设置
        </Link>
        <div className="flex flex-wrap gap-1.5 px-3">
          {["EDGAR", "YFinance"].map((source) => (
            <span
              key={source}
              className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-faint"
            >
              {source}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}
