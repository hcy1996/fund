import Link from "next/link";
import { getFundNavPeriodReturns } from "@/services/fundNavHistoryService";
import { getFundQuote } from "@/services/fundQuoteService";
import { FundDetailClient } from "@/components/funds/fund-detail-client";
import { FundDetailWatchlistActions } from "@/components/funds/fund-detail-watchlist-actions";
import { FundNavChart } from "@/components/funds/fund-nav-chart";

type PageProps = { params: Promise<{ code: string }> };

function fmtNav(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

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

export default async function FundDetailPage({ params }: PageProps) {
  const { code } = await params;
  const decoded = decodeURIComponent(code);
  const [quote, periodReturns] = await Promise.all([getFundQuote(decoded), getFundNavPeriodReturns(decoded)]);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/" className="text-xs text-[#1677ff] hover:underline sm:text-sm">
            ← 返回首页
          </Link>
          <h1 className="mt-0.5 text-lg font-bold leading-snug text-[#1f2a44] sm:text-xl">
            {quote.fundName || "基金详情"}{" "}
            <span className="text-sm font-normal text-[#8ea1c8]">{quote.fundCode}</span>
          </h1>
          <p className="mt-0.5 text-[11px] text-[#6a7ea8]">
            交易时段：{quote.isTradingTime ? "是" : "否"} · 估值时间：{quote.estimateTime || "—"}
          </p>
        </div>
        <FundDetailWatchlistActions fundCode={quote.fundCode} fundName={quote.fundName} />
      </div>

      <section className="grid gap-2 rounded-lg border border-[#dbe5ff] bg-white p-3 shadow-sm sm:grid-cols-2">
        <div>
          <h2 className="text-[11px] font-medium text-[#8ea1c8]">最新净值</h2>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-[#1f2a44] sm:text-xl">
            {quote.nav !== undefined ? fmtNav(quote.nav) : "—"}
          </p>
          <p className="text-[10px] text-[#8ea1c8]">{quote.navDate ? `净值日期 ${quote.navDate}` : ""}</p>
        </div>
        <div>
          <h2 className="text-[11px] font-medium text-[#8ea1c8]">估算净值</h2>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-[#1f2a44] sm:text-xl">
            {quote.estimateNav !== undefined ? fmtNav(quote.estimateNav) : "—"}
          </p>
        </div>
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

      <FundDetailClient
        key={quote.fundCode}
        fundCode={quote.fundCode}
        fundName={quote.fundName}
        initialQuote={quote}
      />
    </div>
  );
}
