export type FundSearchHit = {
  code: string;
  name: string;
  hotCount?: number;
};

export type PkPeriod = { key: string; label: string; pct: number | null };

export type PkStockHolding = {
  code: string;
  name: string;
  weightPct: number | null;
};

export type PkFund = {
  code: string;
  name: string;
  periods: PkPeriod[];
  holdingsTitle?: string | null;
  holdingsStocks?: PkStockHolding[];
};

export const PERIOD_ORDER = [
  { key: "1w", label: "近一周" },
  { key: "1m", label: "近一月" },
  { key: "3m", label: "近三月" },
  { key: "6m", label: "近六月" },
  { key: "1y", label: "近一年" },
  { key: "3y", label: "近三年" },
] as const;

export type PkChartRange = (typeof PERIOD_ORDER)[number]["key"];

export const CHART_COLORS = ["#ff5f6d", "#1677ff", "#00d26a", "#ffb020", "#9baccb"] as const;

export const PK_LABEL_COL_WIDTH = 132;
export const PK_FUND_COL_MIN_WIDTH = 176;

export function getPkGridTemplate(selectedCount: number) {
  if (selectedCount < 1) {
    return `minmax(${PK_LABEL_COL_WIDTH}px, ${PK_LABEL_COL_WIDTH}px) minmax(${PK_FUND_COL_MIN_WIDTH}px, 1fr)`;
  }

  return `minmax(${PK_LABEL_COL_WIDTH}px, ${PK_LABEL_COL_WIDTH}px) repeat(${selectedCount}, minmax(${PK_FUND_COL_MIN_WIDTH}px, 1fr))`;
}

export function getPkGridMinWidth(selectedCount: number) {
  return PK_LABEL_COL_WIDTH + Math.max(1, selectedCount) * PK_FUND_COL_MIN_WIDTH;
}
