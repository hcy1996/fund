import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isTradingTime } from "@/lib/tradingTime";
import { fetchFundGzRaw, fetchFundLatestNavRaw } from "@/providers/fundProvider";
import type { FundQuote } from "@/types/fund";
import { Prisma } from "@prisma/client";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

function parseNum(s: string | undefined): number | undefined {
  if (s === undefined || s === null || s === "") {
    return undefined;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** gszzl 为百分比字符串，如 "0.56" → 0.0056 */
function parseChangeRate(gszzl: string | undefined): number | undefined {
  const p = parseNum(gszzl);
  if (p === undefined) {
    return undefined;
  }
  return p / 100;
}

function getCnDateInfo(now: Date = new Date()) {
  const t = dayjs.utc(now).utcOffset(8);
  return {
    today: t.format("YYYY-MM-DD"),
    day: t.day(), // 0 sunday, 6 saturday
  };
}

/** 略短于 fundgz fetch revalidate(30s)，跨请求合并同一基金行情，减轻东财与并发穿透 */
const FUND_QUOTE_CACHE_SECONDS = 25;

async function buildFundQuote(fundCode: string): Promise<FundQuote> {
  const trading = isTradingTime();
  const [raw, latestNavRaw] = await Promise.all([
    fetchFundGzRaw(fundCode),
    fetchFundLatestNavRaw(fundCode),
  ]);

  if (!raw && !latestNavRaw) {
    return {
      fundCode,
      fundName: "",
      isTradingTime: trading,
    };
  }

  // 净值优先用 lsjz 的最新披露值（周末/节假日仍可显示最近更新）
  const navFromLatest = parseNum(latestNavRaw?.nav);
  const navFromGz = parseNum(raw?.dwjz);
  const navDate = latestNavRaw?.navDate ?? raw?.jzrq;

  const estimateNav = parseNum(raw?.gsz);
  const estimateChangeRate = parseChangeRate(raw?.gszzl);
  const officialChangeRate = parseChangeRate(latestNavRaw?.changeRate);

  // 展示规则：
  // 1) 周末：使用最近已发布正式净值（通常为周五）
  // 2) 工作日：若今日正式净值已发布则用正式值，否则用估算净值
  const { today, day } = getCnDateInfo();
  const isWeekend = day === 0 || day === 6;
  const hasTodayOfficialNav = navDate === today && navFromLatest !== undefined;

  let displayNav: number | undefined;
  let navSource: "estimate" | "official" | undefined;
  let dailyChangeRate: number | undefined;
  if (isWeekend) {
    displayNav = navFromLatest ?? navFromGz ?? estimateNav;
    navSource =
      navFromLatest !== undefined || navFromGz !== undefined
        ? "official"
        : estimateNav !== undefined
          ? "estimate"
          : undefined;
    dailyChangeRate = navSource === "official" ? officialChangeRate : estimateChangeRate;
  } else if (trading && estimateNav !== undefined) {
    // 盘中（含东财已返回 gsz 时）：优先用实时估值，避免 lsjz 日期恰好为当日时误判为「已更新正式净值」
    displayNav = estimateNav ?? navFromLatest ?? navFromGz;
    navSource = "estimate";
    dailyChangeRate = estimateChangeRate ?? officialChangeRate;
  } else if (hasTodayOfficialNav) {
    displayNav = navFromLatest ?? navFromGz ?? estimateNav;
    navSource =
      navFromLatest !== undefined || navFromGz !== undefined
        ? "official"
        : estimateNav !== undefined
          ? "estimate"
          : undefined;
    dailyChangeRate = navSource === "official" ? officialChangeRate : estimateChangeRate;
  } else if (trading) {
    displayNav = estimateNav ?? navFromLatest ?? navFromGz;
    navSource =
      estimateNav !== undefined
        ? "estimate"
        : navFromLatest !== undefined || navFromGz !== undefined
          ? "official"
          : undefined;
    dailyChangeRate = navSource === "official" ? officialChangeRate : estimateChangeRate;
  } else {
    displayNav = navFromLatest ?? navFromGz ?? estimateNav;
    navSource =
      navFromLatest !== undefined || navFromGz !== undefined
        ? "official"
        : estimateNav !== undefined
          ? "estimate"
          : undefined;
    dailyChangeRate = navSource === "official" ? officialChangeRate : estimateChangeRate;
  }

  return {
    fundCode: raw?.fundcode ?? fundCode,
    fundName: raw?.name ?? "",
    officialNav: navFromLatest,
    officialNavDate: latestNavRaw?.navDate,
    officialChangeRate,
    nav: displayNav,
    navDate,
    navSource,
    dailyChangeRate,
    estimateNav,
    estimateChangeRate,
    estimateTime: raw?.gztime,
    isTradingTime: trading,
  };
}

export async function getFundQuote(code: string): Promise<FundQuote> {
  const fundCode = code.trim();
  const trading = isTradingTime();
  if (!fundCode) {
    return {
      fundCode: "",
      fundName: "",
      isTradingTime: trading,
    };
  }

  const quote = await unstable_cache(
    async () => buildFundQuote(fundCode),
    ["fund-quote-v1", fundCode],
    { revalidate: FUND_QUOTE_CACHE_SECONDS },
  )();

  try {
    await prisma.fundSnapshot.create({
      data: {
        fundCode: quote.fundCode,
        nav: quote.nav !== undefined ? new Prisma.Decimal(quote.nav) : null,
        estimateNav:
          quote.estimateNav !== undefined ? new Prisma.Decimal(quote.estimateNav) : null,
        estimateRate:
          quote.estimateChangeRate !== undefined
            ? new Prisma.Decimal(quote.estimateChangeRate)
            : null,
      },
    });
  } catch {
    // 快照失败不影响主流程
  }

  return quote;
}
