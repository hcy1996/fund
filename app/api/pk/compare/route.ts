import { NextResponse } from "next/server";
import { z } from "zod";
import { getFundNavPeriodReturns } from "@/services/fundNavHistoryService";
import { getFundTopStockHoldings } from "@/services/fundPortfolioService";
import { getFundQuote } from "@/services/fundQuoteService";

const pkCompareSchema = z.object({
  codes: z.array(z.string().min(1)).min(1).max(5),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const parsed = pkCompareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const codes = Array.from(
    new Set(
      parsed.data.codes
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
        .slice(0, 5),
    ),
  );
  // 允许选择 1 只基金：用于展示该基金各周期区间涨跌幅

  const funds = await Promise.all(
    codes.map(async (code) => {
      const [quote, periodReturns, topHoldings] = await Promise.all([
        getFundQuote(code),
        getFundNavPeriodReturns(code),
        getFundTopStockHoldings(code),
      ]);
      return {
        code: quote.fundCode || code,
        name: quote.fundName || code,
        periods: periodReturns.periods.map((p) => ({
          key: p.key,
          label: p.label,
          pct: p.pct,
        })),
        holdingsTitle: topHoldings.title,
        holdingsStocks: topHoldings.items,
      };
    }),
  );

  return NextResponse.json({ funds });
}

