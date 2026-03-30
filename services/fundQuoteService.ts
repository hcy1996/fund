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

function getQdiiExpectedNavDate(now: Date = new Date()) {
  const t = dayjs.utc(now).utcOffset(8).startOf("day");
  const day = t.day();
  if (day === 1) return t.subtract(3, "day").format("YYYY-MM-DD");
  if (day >= 2 && day <= 5) return t.subtract(1, "day").format("YYYY-MM-DD");
  if (day === 6) return t.subtract(1, "day").format("YYYY-MM-DD");
  return t.subtract(2, "day").format("YYYY-MM-DD");
}

function isSameCnDay(dateTime: string | undefined, today: string) {
  if (!dateTime) return false;
  return dateTime.slice(0, 10) === today;
}

function getDatePart(dateTime: string | undefined) {
  return dateTime ? dateTime.slice(0, 10) : undefined;
}

function isQdiiFund(name: string | undefined) {
  return /qdii/i.test(name ?? "");
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
  // 1) 今日正式净值已发布：显示正式净值
  // 2) 今日正式净值未发布，但今日估值仍有效：显示估算净值
  // 3) 否则回退到最近正式净值（如周末、节假日、盘前）
  const { today, day } = getCnDateInfo();
  const isWeekend = day === 0 || day === 6;
  const hasTodayOfficialNav = navDate === today && navFromLatest !== undefined;
  const hasTodayEstimateNav = isSameCnDay(raw?.gztime, today) && estimateNav !== undefined;
  const estimateDate = getDatePart(raw?.gztime);
  const isQdii = isQdiiFund(raw?.name);
  const qdiiExpectedNavDate = getQdiiExpectedNavDate();
  const hasFreshQdiiOfficialNav =
    isQdii &&
    navFromLatest !== undefined &&
    latestNavRaw?.navDate !== undefined &&
    latestNavRaw.navDate >= qdiiExpectedNavDate;
  const hasStaleQdiiOfficialNav =
    isQdii &&
    navFromLatest !== undefined &&
    latestNavRaw?.navDate !== undefined &&
    latestNavRaw.navDate < qdiiExpectedNavDate;
  const hasNewerEstimateDate =
    estimateNav !== undefined &&
    estimateDate !== undefined &&
    (latestNavRaw?.navDate === undefined || estimateDate > latestNavRaw.navDate);

  let displayNav: number | undefined;
  let navSource: "estimate" | "official" | "stale" | undefined;
  let dailyChangeRate: number | undefined;
  if (hasFreshQdiiOfficialNav) {
    // QDII 只按周末规则推导“应更新日期”：
    // 周一 -> 上周五；周二到周五 -> 前一个自然日；周六/周日 -> 上周五。
    displayNav = navFromLatest ?? navFromGz ?? estimateNav;
    navSource =
      navFromLatest !== undefined || navFromGz !== undefined
        ? "official"
        : estimateNav !== undefined
          ? "estimate"
          : undefined;
    dailyChangeRate = navSource === "official" ? officialChangeRate : estimateChangeRate;
  } else if (hasStaleQdiiOfficialNav) {
    displayNav = estimateNav ?? navFromLatest ?? navFromGz;
    navSource = estimateNav !== undefined ? "estimate" : "stale";
    dailyChangeRate =
      navSource === "estimate"
        ? estimateChangeRate ?? officialChangeRate
        : officialChangeRate;
  } else if (hasNewerEstimateDate) {
    // 估值日期只要晚于最新正式净值日期，就继续显示估值。
    // 这能覆盖 QDII 正式净值披露滞后（常见 T+2）以及普通基金收盘后正式净值未出的场景。
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
  } else if (hasTodayEstimateNav) {
    displayNav = estimateNav ?? navFromLatest ?? navFromGz;
    navSource = "estimate";
    dailyChangeRate = estimateChangeRate ?? officialChangeRate;
  } else if (isWeekend) {
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
