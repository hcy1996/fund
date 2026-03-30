import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { unstable_cache } from "next/cache";
import { maxDrawdownPctFromNavs, sharpeAnnualizedFromNavs } from "@/lib/fundPeriodMetrics";
import { fetchFundLsjzPage } from "@/providers/fundProvider";
import type {
  FundNavHistoryDto,
  FundNavHistoryPoint,
  FundNavHistoryRange,
  FundNavPeriodReturnsDto,
} from "@/types/fund";

/** 各周期大致需要的分页数（每页 20 个交易日） */
const RANGE_MAX_PAGES: Record<FundNavHistoryRange, number> = {
  "1m": 2,
  "3m": 5,
  "6m": 10,
  "1y": 20,
  /** 约 3 年交易日，每页 20 条 */
  "3y": 45,
  /** 约 5 年交易日 */
  "5y": 72,
  /** 在接口与耗时可接受范围内尽量多取 */
  max: 90,
};

const RANGE_MONTHS: Record<Exclude<FundNavHistoryRange, "max">, number> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
  "1y": 12,
  "3y": 36,
  "5y": 60,
};

/** 实际拉取并聚合东财 lsjz（由 getFundNavHistory 的 unstable_cache 包裹） */
async function getFundNavHistoryUncached(code: string, range: FundNavHistoryRange): Promise<FundNavHistoryDto> {
  const first = await fetchFundLsjzPage(code, 1);
  if (!first || first.list.length === 0) {
    return { fundCode: code, range, totalCount: first?.totalCount ?? 0, points: [] };
  }

  const totalPagesByData = Math.ceil(first.totalCount / 20);
  const wantPages = Math.min(RANGE_MAX_PAGES[range], totalPagesByData);

  const pageResults: Awaited<ReturnType<typeof fetchFundLsjzPage>>[] = [];
  const batchSize = 8;
  for (let start = 0; start < wantPages; start += batchSize) {
    const end = Math.min(start + batchSize, wantPages);
    const batch = await Promise.all(
      Array.from({ length: end - start }, (_, j) => fetchFundLsjzPage(code, start + j + 1)),
    );
    pageResults.push(...batch);
  }

  const byDate = new Map<string, number>();
  for (const pg of pageResults) {
    if (!pg) continue;
    for (const row of pg.list) {
      const d = row.FSRQ?.trim();
      const navStr = row.DWJZ?.trim();
      if (!d || navStr === undefined || navStr === "") continue;
      const nav = Number(navStr);
      if (!Number.isFinite(nav)) continue;
      byDate.set(d, nav);
    }
  }

  let points: FundNavHistoryPoint[] = [...byDate.entries()]
    .map(([date, nav]) => ({ date, nav }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (range !== "max" && points.length > 0) {
    const last = points[points.length - 1]!.date;
    const end = dayjs(last);
    const start = end.subtract(RANGE_MONTHS[range], "month");
    points = points.filter((p) => !dayjs(p.date).isBefore(start, "day"));
  }

  return {
    fundCode: code,
    range,
    totalCount: first.totalCount,
    points,
  };
}

const NAV_HISTORY_CACHE_SECONDS = 86_400;

/**
 * 历史净值曲线：按 (基金代码, 区间) 全量缓存 24h，避免详情/图表重复打东财分页接口。
 */
export async function getFundNavHistory(
  fundCode: string,
  range: FundNavHistoryRange,
): Promise<FundNavHistoryDto> {
  const code = fundCode.trim();
  if (!code) {
    return { fundCode: code, range, totalCount: 0, points: [] };
  }
  return unstable_cache(
    async () => getFundNavHistoryUncached(code, range),
    ["fund-nav-history-v1", code, range],
    { revalidate: NAV_HISTORY_CACHE_SECONDS },
  )();
}

/** 在升序净值序列中，找 date ≤ target（日历日）的最后一个点（用于区间涨跌幅期初净值） */
function findNavOnOrBefore(points: FundNavHistoryPoint[], target: Dayjs): FundNavHistoryPoint | null {
  let lo = 0;
  let hi = points.length - 1;
  let ans: FundNavHistoryPoint | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const d = dayjs(points[mid]!.date);
    if (d.isAfter(target, "day")) {
      hi = mid - 1;
    } else {
      ans = points[mid]!;
      lo = mid + 1;
    }
  }
  return ans;
}

const PERIOD_DEFS: { key: string; label: string; subtract: (end: Dayjs) => Dayjs }[] = [
  { key: "1w", label: "近一周", subtract: (end) => end.subtract(7, "day") },
  { key: "1m", label: "近一月", subtract: (end) => end.subtract(1, "month") },
  { key: "3m", label: "近三月", subtract: (end) => end.subtract(3, "month") },
  { key: "6m", label: "近六月", subtract: (end) => end.subtract(6, "month") },
  { key: "1y", label: "近一年", subtract: (end) => end.subtract(1, "year") },
  { key: "3y", label: "近三年", subtract: (end) => end.subtract(3, "year") },
];

const emptyPeriodRow = {
  pct: null as number | null,
  maxDrawdownPct: null as number | null,
  sharpe: null as number | null,
};

async function getFundNavPeriodReturnsUncached(code: string): Promise<FundNavPeriodReturnsDto> {
  const hist = await getFundNavHistory(code, "3y");
  const points = hist.points;
  const empty = PERIOD_DEFS.map((p) => ({
    key: p.key,
    label: p.label,
    ...emptyPeriodRow,
  }));
  if (points.length < 2) {
    return { fundCode: hist.fundCode, periods: empty };
  }
  const last = points[points.length - 1]!;
  const lastD = dayjs(last.date);
  const periods = PERIOD_DEFS.map((def) => {
    const boundary = def.subtract(lastD);
    const start = findNavOnOrBefore(points, boundary);
    if (!start || start.date === last.date || start.nav <= 0) {
      return { key: def.key, label: def.label, ...emptyPeriodRow };
    }
    const raw = (last.nav / start.nav - 1) * 100;
    if (!Number.isFinite(raw)) {
      return { key: def.key, label: def.label, ...emptyPeriodRow };
    }
    const startIdx = points.findIndex((p) => p.date === start.date);
    if (startIdx < 0) {
      return {
        key: def.key,
        label: def.label,
        pct: Math.round(raw * 100) / 100,
        maxDrawdownPct: null,
        sharpe: null,
      };
    }
    const navs = points.slice(startIdx).map((p) => p.nav);
    const maxDrawdownPct = maxDrawdownPctFromNavs(navs);
    const sharpe = sharpeAnnualizedFromNavs(navs);
    return {
      key: def.key,
      label: def.label,
      pct: Math.round(raw * 100) / 100,
      maxDrawdownPct,
      sharpe,
    };
  });
  return { fundCode: hist.fundCode, periods };
}

/**
 * 区间涨跌/回撤/夏普：按基金代码缓存 24h（内部复用已缓存的近三年净值）。
 */
export async function getFundNavPeriodReturns(fundCode: string): Promise<FundNavPeriodReturnsDto> {
  const code = fundCode.trim();
  const emptyResponse = (): FundNavPeriodReturnsDto => ({
    fundCode: code,
    periods: PERIOD_DEFS.map((p) => ({
      key: p.key,
      label: p.label,
      ...emptyPeriodRow,
    })),
  });
  if (!code) {
    return emptyResponse();
  }
  return unstable_cache(
    async () => getFundNavPeriodReturnsUncached(code),
    ["fund-nav-period-returns-v2", code],
    { revalidate: NAV_HISTORY_CACHE_SECONDS },
  )();
}
