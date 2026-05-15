import { fetchEvents, fetchOpportunities } from "@/lib/server-data";
import { EventsFeed } from "@/components/EventsFeed";
import { OpportunityRadar } from "@/components/OpportunityRadar";
import { AlertTriangle, DatabaseZap } from "lucide-react";

export const revalidate = 60;

export default async function Home() {
  const [eventsResult, opportunitiesResult] = await Promise.allSettled([
    fetchEvents(),
    fetchOpportunities(),
  ]);

  const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
  const opportunities = opportunitiesResult.status === "fulfilled" ? opportunitiesResult.value : [];
  const hasDataError =
    eventsResult.status === "rejected" ||
    opportunitiesResult.status === "rejected";
  const isEmpty = events.length === 0 && opportunities.length === 0;

  return (
    <div className="max-w-6xl">
      <div className="mb-8 border-b border-[#D4CCB8] pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-[#B5882B]">
              Signal Intelligence
            </p>
            <h1 className="font-display text-4xl text-[#1A1A2E] sm:text-5xl">
              Market Radar
            </h1>
          </div>
        </div>
      </div>

      {hasDataError && (
        <div className="mb-6 rounded-xl border border-[#B5882B]/30 bg-[#B5882B]/[0.07] px-4 py-4 text-[#1A1A2E]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#B5882B]" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#B5882B]">Data Warning</p>
              <p className="mt-1 text-sm leading-relaxed text-[#5C5C6E]">
                部分数据暂时读取失败，页面先展示可用内容。请稍后刷新，或检查同步脚本/数据库连接。
              </p>
            </div>
          </div>
        </div>
      )}

      {isEmpty ? (
        <div className="mb-10 rounded-2xl border border-dashed border-[#D4CCB8] bg-[#EDE8DE]/45 px-5 py-10 text-center">
          <DatabaseZap className="mx-auto mb-3 size-6 text-[#B5882B]" />
          <p className="font-display text-2xl text-[#1A1A2E]">暂无可展示的市场数据</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#5C5C6E]">
            机会和信息流还没有返回结果。确认数据同步任务完成后，刷新页面即可看到市场雷达。
          </p>
        </div>
      ) : (
        <OpportunityRadar opportunities={opportunities} />
      )}

      <div className="border-t border-[#D4CCB8]">
        <div className="py-6 border-b border-[#D4CCB8]">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-[#B5882B]">
            Evidence Feed
          </p>
          <h2 className="font-display text-2xl text-[#1A1A2E] sm:text-3xl">
            Information Stream
          </h2>
        </div>
        <EventsFeed events={events} />
      </div>
    </div>
  );
}
