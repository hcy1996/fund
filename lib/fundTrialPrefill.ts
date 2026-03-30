import type { FundQuote } from "@/types/fund";

/** 试算「净值」框：仅填来源明确的正式口径，否则留空 */
export function fundTrialNavInput(q: FundQuote): string {
  if (q.officialNav !== undefined && Number.isFinite(q.officialNav)) {
    return String(q.officialNav);
  }
  if (q.navSource === "official" && q.nav !== undefined && Number.isFinite(q.nav)) {
    return String(q.nav);
  }
  return "";
}

/** 试算「估算净值」框：仅在有估值时回填 */
export function fundTrialEstimateNavInput(q: FundQuote): string {
  if (q.estimateNav !== undefined && Number.isFinite(q.estimateNav)) {
    return String(q.estimateNav);
  }
  return "";
}
