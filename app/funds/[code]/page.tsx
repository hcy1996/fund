import Link from "next/link";
import { getFundNavPeriodReturns } from "@/services/fundNavHistoryService";
import { getFundQuote } from "@/services/fundQuoteService";
import { getFundCategoryByCode } from "@/services/fundCategoryService";
import { FundDetailClient } from "@/components/funds/fund-detail-client";
import { FundDetailWatchlistActions } from "@/components/funds/fund-detail-watchlist-actions";
import { FundNavChart } from "@/components/funds/fund-nav-chart";
import { FundCategoryTag } from "@/components/funds/fund-category-tag";

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams?: Promise<{ accountId?: string }>;
};

function fmtSignedPct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtDrawdown(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `-${n.toFixed(2)}%`;
}

function fmtSharpe(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

export default async function FundDetailPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const decoded = decodeURIComponent(code);
  const [quote, periodReturns, category] = await Promise.all([
    getFundQuote(decoded),
    getFundNavPeriodReturns(decoded),
    getFundCategoryByCode(decoded),
  ]);
  const initialAccountId = (await searchParams)?.accountId?.trim() || undefined;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/" className="text-xs text-[#1677ff] hover:underline sm:text-sm">
            ← 返回首页
          </Link>
          <h1 className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-bold leading-snug text-[#1f2a44] sm:text-xl">
            <span>{quote.fundName || "基金详情"}</span>
            <span className="text-sm font-normal text-[#8ea1c8]">{quote.fundCode}</span>
            <FundCategoryTag
              fundCode={quote.fundCode}
              initialCategoryId={category.categoryId}
              initialLabel={category.label}
            />
          </h1>
          <p className="mt-0.5 text-[11px] text-[#6a7ea8]">
            交易时段：{quote.isTradingTime ? "是" : "否"} · 估值时间：{quote.estimateTime || "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FundDetailWatchlistActions fundCode={quote.fundCode} fundName={quote.fundName} />
          <Link
            href={`/pk?fundCode=${encodeURIComponent(quote.fundCode)}`}
            className="rounded-lg border border-[#dbe5ff] bg-white px-3 py-1.5 text-xs font-medium text-[#5e6f95] hover:bg-[#f5f8ff] sm:text-sm flex items-center justify-center leading-none"
          >
            加入 PK
          </Link>
        </div>
      </div>

      <section className="rounded-lg border border-[#dbe5ff] bg-white p-3 shadow-sm">
        <FundDetailClient
          key={quote.fundCode}
          fundCode={quote.fundCode}
          fundName={quote.fundName}
          initialQuote={quote}
          initialAccountId={initialAccountId}
          variant="embedded"
        />
      </section>

      <section className="rounded-lg border border-[#dbe5ff] bg-white p-3 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1f2a44]">区间表现</h2>
        <p className="mt-0.5 text-[10px] leading-snug text-[#8ea1c8]">
          按东财披露单位净值（lsjz）：区间涨跌为期末相对期初净值；最大回撤为区间内相对历史峰值的最大跌幅；夏普为日收益率年化（无风险利率
          0、√252），交易日过少时波动大、仅供参考。
        </p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {periodReturns.periods.map((row) => (
            <li
              key={row.key}
              className="rounded-md border border-[#e8efff] bg-[#f9fbff] px-2 py-1.5"
            >
              <p className="text-xs font-medium text-[#1f2a44]">{row.label}</p>
              <dl className="mt-1 space-y-0.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#8ea1c8]">区间涨跌</dt>
                  <dd
                    className={`font-semibold tabular-nums ${
                      row.pct === null
                        ? "text-[#9baccb]"
                        : row.pct >= 0
                          ? "text-[#ff5f6d]"
                          : "text-[#00d26a]"
                    }`}
                  >
                    {fmtSignedPct(row.pct)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#8ea1c8]">最大回撤</dt>
                  <dd className="font-semibold tabular-nums text-[#00d26a]">
                    {fmtDrawdown(row.maxDrawdownPct)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#8ea1c8]">夏普比率</dt>
                  <dd className="font-semibold tabular-nums text-[#1f2a44]">{fmtSharpe(row.sharpe)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <FundNavChart fundCode={quote.fundCode} />
    </div>
  );
}
