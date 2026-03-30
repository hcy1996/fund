/**
 * 基于区间内按日（交易日）披露的单位净值序列计算风险指标。
 */

/**
 * 最大回撤深度（百分比正数）：区间内任意峰值之后到随后的谷底，相对峰值下跌比例的最大值。
 * 例如 15.2 表示最深一波从峰值回撤了 15.2%。
 */
export function maxDrawdownPctFromNavs(navs: number[]): number | null {
  if (navs.length < 2) return null;
  let peak = navs[0]!;
  let maxDd = 0;
  for (const v of navs) {
    if (v <= 0 || !Number.isFinite(v)) return null;
    peak = Math.max(peak, v);
    maxDd = Math.max(maxDd, (peak - v) / peak);
  }
  return Math.round(maxDd * 10000) / 100;
}

/**
 * 夏普比率：日收益率序列（相邻净值比减 1），样本均值 / 样本标准差 × √252 ，无风险利率按 0。
 * 短区间样本少、年化后波动大，仅供参考。
 */
export function sharpeAnnualizedFromNavs(navs: number[], tradingDaysPerYear = 252): number | null {
  if (navs.length < 3) return null;
  const rets: number[] = [];
  for (let i = 1; i < navs.length; i++) {
    const a = navs[i - 1]!;
    const b = navs[i]!;
    if (a <= 0) return null;
    rets.push(b / a - 1);
  }
  const n = rets.length;
  const mean = rets.reduce((s, r) => s + r, 0) / n;
  let varSum = 0;
  for (const r of rets) varSum += (r - mean) ** 2;
  const std = Math.sqrt(varSum / (n - 1));
  if (std < 1e-12 || !Number.isFinite(std)) return null;
  const sharpe = (mean / std) * Math.sqrt(tradingDaysPerYear);
  if (!Number.isFinite(sharpe)) return null;
  return Math.round(sharpe * 100) / 100;
}
