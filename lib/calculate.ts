import Decimal from "decimal.js";

import type { FundProfitInput, FundProfitResult } from "@/types/fund";

function toDec(n: number | undefined): Decimal | null {
  if (n === undefined || n === null || Number.isNaN(n)) {
    return null;
  }
  return new Decimal(n);
}

/**
 * 基金持仓收益计算（金额用 Decimal，返回 number 供 JSON/展示）
 */
export function calculateFundProfit(input: FundProfitInput): FundProfitResult {
  const shares = toDec(input.shares);
  if (!shares || shares.lte(0)) {
    return {
      estimateValue: 0,
      navValue: 0,
      dailyProfit: 0,
      dailyProfitRate: 0,
      totalProfit: 0,
      totalProfitRate: 0,
    };
  }

  const estimateNav = toDec(input.estimateNav);
  const nav = toDec(input.nav);
  const cost = toDec(input.costPrice);

  const estimateValue = estimateNav ? shares.mul(estimateNav) : new Decimal(0);
  const navValue = nav ? shares.mul(nav) : new Decimal(0);

  let dailyProfit = new Decimal(0);
  let dailyProfitRate = new Decimal(0);
  if (estimateNav && nav) {
    dailyProfit = shares.mul(estimateNav.sub(nav));
    const denom = shares.mul(nav);
    dailyProfitRate = denom.gt(0) ? dailyProfit.div(denom) : new Decimal(0);
  }

  let totalProfit: Decimal | undefined;
  let totalProfitRate: Decimal | undefined;
  if (cost && estimateNav) {
    const costTotal = shares.mul(cost);
    // 总收益口径：不使用估算净值，避免盘中“持有收益/持有金额”跟随估算跳动
    // 当日收益（dailyProfit）才使用 estimateNav
    totalProfit = navValue.sub(costTotal);
    totalProfitRate = costTotal.gt(0) ? totalProfit.div(costTotal) : new Decimal(0);
  }

  return {
    estimateValue: estimateValue.toNumber(),
    navValue: navValue.toNumber(),
    dailyProfit: dailyProfit.toNumber(),
    dailyProfitRate: dailyProfitRate.toNumber(),
    totalProfit: totalProfit?.toNumber(),
    totalProfitRate: totalProfitRate?.toNumber(),
  };
}
