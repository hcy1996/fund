import type { FundProfitResult } from "@/types/fund";

export type HoldingWithProfit = {
  id: string;
  fundCode: string;
  fundName: string;
  shares: string;
  costPrice: string;
  sortOrder?: number | null;
  navTag?: "estimate" | "official";
  navDate?: string;
  nav?: number;
  dailyChangeRate?: number;
  profit: FundProfitResult;
};
