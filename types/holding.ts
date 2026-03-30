import type { FundProfitResult } from "@/types/fund";

export type HoldingWithProfit = {
  id: string;
  fundCode: string;
  fundName: string;
  shares: string;
  costPrice: string;
  sortOrder?: number | null;
  navTag?: "estimate" | "official" | "stale";
  navDate?: string;
  /** 东财估值时间（fundgz gztime，精确到分钟），用于前端表头展示 */
  estimateTime?: string;
  nav?: number;
  dailyChangeRate?: number;
  profit: FundProfitResult;
};
