/** 统一基金行情（估值 + 净值），供 API 与前端使用 */
export type FundQuote = {
  fundCode: string;
  fundName: string;
  /** 最新正式净值（lsjz） */
  officialNav?: number;
  officialNavDate?: string;
  officialChangeRate?: number;
  nav?: number;
  navDate?: string;
  /** 当前用于展示净值的来源：estimate=估算净值, official=正式净值 */
  navSource?: "estimate" | "official";
  /** 当前展示净值对应的当日涨跌幅 */
  dailyChangeRate?: number;
  estimateNav?: number;
  /** 相对上一日净值的涨跌幅，小数形式，例如 0.0056 表示 0.56% */
  estimateChangeRate?: number;
  estimateTime?: string;
  isTradingTime: boolean;
};

export type FundProfitInput = {
  shares: number;
  estimateNav?: number;
  nav?: number;
  costPrice?: number;
};

export type FundProfitResult = {
  estimateValue: number;
  navValue: number;
  dailyProfit: number;
  dailyProfitRate: number;
  totalProfit?: number;
  totalProfitRate?: number;
};

/** 历史净值曲线单点（东财 lsjz，日期升序） */
export type FundNavHistoryPoint = {
  date: string;
  nav: number;
};

export type FundNavHistoryRange = "1m" | "3m" | "6m" | "1y" | "3y" | "5y" | "max";

export type FundNavHistoryDto = {
  fundCode: string;
  range: FundNavHistoryRange;
  totalCount: number;
  points: FundNavHistoryPoint[];
};

/** 详情页：按历史净值区间表现 */
export type FundNavPeriodReturnRow = {
  key: string;
  label: string;
  /** 区间涨跌幅（百分数，如 2.35 表示 +2.35%） */
  pct: number | null;
  /** 最大回撤深度（百分数正数，如 15.2 表示从峰值最大回撤 15.2%） */
  maxDrawdownPct: number | null;
  /** 年化夏普（日收益、Rf=0、√252），null 表示样本不足或波动为 0 */
  sharpe: number | null;
};

export type FundNavPeriodReturnsDto = {
  fundCode: string;
  periods: FundNavPeriodReturnRow[];
};
