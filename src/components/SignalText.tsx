import type { ReactNode } from "react";

/**
 * 把管道产出的原始文本渲染成"数据优先"的富文本:
 * - (conviction=NN) / (bearish conviction=NN) / (conviction=NN forming) → 数据徽章
 * - 句首导语自动加粗
 * - "1)...2)...3)" 自动拆成编号条目 (SignalPoints)
 *
 * 实现:先把 conviction 标注提取为占位符,再做条目拆分/导语拆分,
 * 避免 "(conviction=57)" 中的 "57)" 被误判为条目编号。
 */

const CONV_RE = /[（(]\s*(bearish[\s]*)?conviction\s*=\s*(\d+)(?:\s+(forming))?\s*[)）]/gi;
const TOKEN_OPEN = "";
const TOKEN_CLOSE = "";
const TOKEN_RE = /(\d+)/g;

type Conv = { score: number; bearish: boolean; forming: boolean };

function convTone(score: number) {
  if (score >= 80) return "text-accent";
  if (score >= 50) return "text-foreground";
  return "text-faint";
}

export function ConvictionChip({ score, bearish, forming }: Conv) {
  return (
    <span className="mx-1 inline-flex -translate-y-px items-center gap-1 whitespace-nowrap rounded-md border border-border bg-surface-2 px-1.5 py-px align-middle font-mono text-xs leading-5">
      {bearish && <span className="font-semibold text-down">空</span>}
      <span className="text-faint">信心</span>
      <span className={"num text-xs font-bold " + convTone(score)}>{score}</span>
      {forming && <span className="text-warn">形成中</span>}
    </span>
  );
}

/** 提取 conviction 标注 → 占位符 + 徽章数据 */
function tokenize(text: string): { masked: string; convs: Conv[] } {
  const convs: Conv[] = [];
  const masked = text.replace(CONV_RE, (_, bearish, score, forming) => {
    convs.push({
      score: Number(score),
      bearish: Boolean(bearish),
      forming: Boolean(forming),
    });
    return `${TOKEN_OPEN}${convs.length - 1}${TOKEN_CLOSE}`;
  });
  return { masked, convs };
}

/** 渲染带占位符的文本片段,把占位符还原成徽章 */
function renderMasked(masked: string, convs: Conv[], keyPrefix = ""): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = new RegExp(TOKEN_RE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    if (m.index > last) nodes.push(masked.slice(last, m.index));
    const conv = convs[Number(m[1])];
    if (conv) nodes.push(<ConvictionChip key={`${keyPrefix}c${m.index}`} {...conv} />);
    last = m.index + m[0].length;
  }
  if (last < masked.length) nodes.push(masked.slice(last));
  return nodes;
}

/** 找句首导语(第一个分隔符之前的短语),用于加粗 */
function splitLead(text: string, seps: string[], maxLen: number) {
  let idx = -1;
  for (const s of seps) {
    const i = text.indexOf(s);
    if (i > 0 && i <= maxLen && (idx === -1 || i < idx)) idx = i;
  }
  if (idx === -1) return null;
  return { lead: text.slice(0, idx + 1), rest: text.slice(idx + 1) };
}

function renderWithLead(
  masked: string,
  convs: Conv[],
  seps: string[],
  keyPrefix = ""
): ReactNode {
  const split = splitLead(masked, seps, 40);
  if (!split) return renderMasked(masked, convs, keyPrefix);
  return (
    <>
      <span className="font-semibold text-foreground">
        {renderMasked(split.lead, convs, `${keyPrefix}l`)}
      </span>
      {renderMasked(split.rest, convs, `${keyPrefix}r`)}
    </>
  );
}

export function SignalText({
  text,
  className = "",
  lead = false,
}: {
  text: string;
  className?: string;
  lead?: boolean;
}) {
  const { masked, convs } = tokenize(text);
  return (
    <p className={className}>
      {lead ? renderWithLead(masked, convs, ["：", ":"]) : renderMasked(masked, convs)}
    </p>
  );
}

/** 拆分 "1)...2)...3)" 形式的要点;不满足格式时退回 SignalText */
export function SignalPoints({ text, className = "" }: { text: string; className?: string }) {
  const { masked, convs } = tokenize(text);

  if (!/(?:^|[^\d=])1\)/.test(masked) || !/(?:^|[^\d=])2\)/.test(masked)) {
    return <SignalText text={text} lead className={className} />;
  }

  const firstIdx = masked.search(/\d{1,2}\)/);
  const intro = masked.slice(0, firstIdx).replace(/[：:;；,，]\s*$/, "");
  const body = masked.slice(firstIdx);

  const items: { n: string; content: string }[] = [];
  const re = /(\d{1,2})\)\s*([^]*?)(?=[;；。]?\s*\d{1,2}\)|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    items.push({ n: m[1], content: m[2].replace(/^[;；]\s*/, "").trim() });
  }

  return (
    <div className={className}>
      {intro && (
        <p className="mb-3 font-semibold text-foreground">{renderMasked(intro, convs, "i")}</p>
      )}
      <ul className="space-y-2.5">
        {items.map(({ n, content }, idx) => (
          <li key={`${n}-${idx}`} className="flex items-start gap-3">
            <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent/10 font-mono text-xs font-bold text-accent">
              {n}
            </span>
            <span className="min-w-0">
              {renderWithLead(content, convs, ["，", ","], `p${n}`)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
