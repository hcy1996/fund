import { prisma } from "@/lib/prisma";
import { HoldingMoveConflictError } from "@/lib/holdingErrors";
import { listAccountsForUser, resolveAccountIdForUser } from "@/services/accountService";
import { getFundQuote } from "@/services/fundQuoteService";
import { addWatchlistItem, ensureDefaultWatchlistGroup } from "@/services/watchlistService";
import type { HoldingWithProfit } from "@/types/holding";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";

export type { HoldingWithProfit };

export type HoldingsDebugTimings = {
  uniqueFundCodes: number;
  quoteMsTotal: number;
  quoteMsAvg: number;
  quoteMsMax: number;
  quotePerCode?: Array<{ code: string; ms: number }>;
};

export async function listHoldingsForUser(
  userId: string,
  accountId?: string,
  opts?: { debug?: boolean },
): Promise<{ data: HoldingWithProfit[]; debugTimings?: HoldingsDebugTimings }> {
  let targetAccountId = accountId;
  if (!targetAccountId) {
    const accounts = await listAccountsForUser(userId);
    targetAccountId = accounts[0]?.id;
  }
  const rows = await prisma.holding.findMany({
    where: { userId, accountId: targetAccountId },
    include: { fund: true },
  });

  // 同一请求内：如果同一只基金在多条 holding 里出现，只取一次行情，显著降低外部接口调用次数
  const uniqueCodes = Array.from(new Set(rows.map((h) => h.fund.code)));
  const t0 = Date.now();
  const uniqueQuotes = await Promise.all(
    uniqueCodes.map(async (code) => {
      const t1 = Date.now();
      const q = await getFundQuote(code);
      const ms = Date.now() - t1;
      return opts?.debug ? { code, q, ms } : { code, q, ms: 0 };
    }),
  );
  const quoteMsTotal = Date.now() - t0;
  const perCode = opts?.debug ? uniqueQuotes.map((x) => ({ code: x.code, ms: x.ms })) : undefined;
  const quoteMsMax = opts?.debug ? Math.max(...(perCode?.map((x) => x.ms) ?? [0])) : 0;
  const quoteMsAvg = opts?.debug
    ? perCode && perCode.length > 0
      ? perCode.reduce((s, it) => s + it.ms, 0) / perCode.length
      : 0
    : 0;
  const quoteByCode = new Map(uniqueCodes.map((code, i) => [code, uniqueQuotes[i]!.q] as const));
  const out: HoldingWithProfit[] = [];
  for (let i = 0; i < rows.length; i++) {
    const h = rows[i]!;
    const quote = quoteByCode.get(h.fund.code)!;
    const shares = new Decimal(h.shares.toString());
    const costPrice = new Decimal(h.costPrice.toString());
    // 当日涨跌/当日收益：与 getFundQuote 的 quote.nav、quote.dailyChangeRate 一致（盘中优先估值）
    const dailyNav = new Decimal(quote.nav ?? quote.estimateNav ?? quote.officialNav ?? 0);
    const dailyValue = shares.mul(dailyNav);
    const costTotal = shares.mul(costPrice);

    const dailyRate =
      quote.dailyChangeRate ?? quote.estimateChangeRate ?? quote.officialChangeRate ?? 0;
    let dailyProfit = new Decimal(0);
    if (dailyNav.gt(0) && dailyRate > -1) {
      const prevNav = dailyNav.div(new Decimal(1).plus(dailyRate));
      dailyProfit = shares.mul(dailyNav.minus(prevNav));
    }

    // 持有金额/持有收益（总收益）：盘中若使用估算净值，只用于当日变化；
    // 总额应使用“最后正式净值（dwjz/lsjz）”，避免与支付宝持仓页口径偏离。
    const totalNav =
      quote.navSource !== "official" && quote.officialNav !== undefined
        ? new Decimal(quote.officialNav)
        : dailyNav;
    const totalValue = shares.mul(totalNav);

    const totalProfit = totalValue.minus(costTotal);
    const totalProfitRate = costTotal.gt(0) ? totalProfit.div(costTotal) : new Decimal(0);

    const profit = {
      // 对外保留两个口径，前端可分别展示“市值(估)”与“市值(净)”
      estimateValue: dailyValue.toNumber(),
      navValue: totalValue.toNumber(),
      dailyProfit: dailyProfit.toNumber(),
      dailyProfitRate: dailyRate,
      totalProfit: totalProfit.toNumber(),
      totalProfitRate: totalProfitRate.toNumber(),
    };
    out.push({
      id: h.id,
      fundCode: h.fund.code,
      fundName: quote.fundName || h.fund.name,
      shares: h.shares.toString(),
      costPrice: h.costPrice.toString(),
      sortOrder: h.sortOrder,
      navTag: quote.navSource,
      navDate: quote.officialNavDate ?? quote.navDate,
      estimateTime: quote.estimateTime,
      nav: quote.nav,
      dailyChangeRate: dailyRate,
      profit,
    });
  }
  const hasManualOrder = out.some((x) => x.sortOrder !== null && x.sortOrder !== undefined);
  if (hasManualOrder) {
    const sorted = out.sort(
      (a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
    );
    return {
      data: sorted,
      debugTimings:
        opts?.debug && uniqueCodes.length > 0
          ? {
              uniqueFundCodes: uniqueCodes.length,
              quoteMsTotal,
              quoteMsAvg,
              quoteMsMax,
              quotePerCode: perCode,
            }
          : undefined,
    };
  }
  // 默认按“持有金额(净)”排序，避免盘中估算导致排序与展示不一致
  const sorted = out.sort((a, b) => b.profit.navValue - a.profit.navValue);
  return {
    data: sorted,
    debugTimings:
      opts?.debug && uniqueCodes.length > 0
        ? {
            uniqueFundCodes: uniqueCodes.length,
            quoteMsTotal,
            quoteMsAvg,
            quoteMsMax,
            quotePerCode: perCode,
          }
        : undefined,
  };
}

export async function listHoldingsForUserByAccountIds(
  userId: string,
  accountIds: string[],
  opts?: { debug?: boolean },
): Promise<{ data: HoldingWithProfit[]; debugTimings?: HoldingsDebugTimings }> {
  const ids = accountIds.filter(Boolean);
  if (ids.length === 0) return { data: [] };

  const rows = await prisma.holding.findMany({
    where: { userId, accountId: { in: ids } },
    include: { fund: true },
  });
  if (rows.length === 0) return { data: [] };

  // 同一请求内：对 fundCode 去重，避免重复请求行情
  const uniqueCodes = Array.from(new Set(rows.map((h) => h.fund.code)));
  const t0 = Date.now();
  const uniqueQuotes = await Promise.all(
    uniqueCodes.map(async (code) => {
      const t1 = Date.now();
      const q = await getFundQuote(code);
      const ms = Date.now() - t1;
      return opts?.debug ? { code, q, ms } : { code, q, ms: 0 };
    }),
  );
  const quoteMsTotal = Date.now() - t0;
  const perCode = opts?.debug ? uniqueQuotes.map((x) => ({ code: x.code, ms: x.ms })) : undefined;
  const quoteMsMax = opts?.debug ? Math.max(...(perCode?.map((x) => x.ms) ?? [0])) : 0;
  const quoteMsAvg = opts?.debug
    ? perCode && perCode.length > 0
      ? perCode.reduce((s, it) => s + it.ms, 0) / perCode.length
      : 0
    : 0;
  const quoteByCode = new Map(uniqueCodes.map((code, i) => [code, uniqueQuotes[i]!.q] as const));
  const out: HoldingWithProfit[] = [];
  for (let i = 0; i < rows.length; i++) {
    const h = rows[i]!;
    const quote = quoteByCode.get(h.fund.code)!;
    const shares = new Decimal(h.shares.toString());
    const costPrice = new Decimal(h.costPrice.toString());
    const dailyNav = new Decimal(quote.nav ?? quote.estimateNav ?? quote.officialNav ?? 0);
    const dailyValue = shares.mul(dailyNav);
    const costTotal = shares.mul(costPrice);

    const dailyRate = quote.dailyChangeRate ?? quote.estimateChangeRate ?? quote.officialChangeRate ?? 0;
    let dailyProfit = new Decimal(0);
    if (dailyNav.gt(0) && dailyRate > -1) {
      const prevNav = dailyNav.div(new Decimal(1).plus(dailyRate));
      dailyProfit = shares.mul(dailyNav.minus(prevNav));
    }

    const totalNav =
      quote.navSource !== "official" && quote.officialNav !== undefined
        ? new Decimal(quote.officialNav)
        : dailyNav;
    const totalValue = shares.mul(totalNav);

    const totalProfit = totalValue.minus(costTotal);
    const totalProfitRate = costTotal.gt(0) ? totalProfit.div(costTotal) : new Decimal(0);

    const profit = {
      estimateValue: dailyValue.toNumber(),
      navValue: totalValue.toNumber(),
      dailyProfit: dailyProfit.toNumber(),
      dailyProfitRate: dailyRate,
      totalProfit: totalProfit.toNumber(),
      totalProfitRate: totalProfitRate.toNumber(),
    };
    out.push({
      id: h.id,
      fundCode: h.fund.code,
      fundName: quote.fundName || h.fund.name,
      shares: h.shares.toString(),
      costPrice: h.costPrice.toString(),
      sortOrder: h.sortOrder,
      navTag: quote.navSource,
      navDate: quote.officialNavDate ?? quote.navDate,
      estimateTime: quote.estimateTime,
      nav: quote.nav,
      dailyChangeRate: dailyRate,
      profit,
    });
  }

  const hasManualOrder = out.some((x) => x.sortOrder !== null && x.sortOrder !== undefined);
  if (hasManualOrder) {
    const sorted = out.sort(
      (a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
    );
    return {
      data: sorted,
      debugTimings:
        opts?.debug && uniqueCodes.length > 0
          ? {
              uniqueFundCodes: uniqueCodes.length,
              quoteMsTotal,
              quoteMsAvg,
              quoteMsMax,
              quotePerCode: perCode,
            }
          : undefined,
    };
  }
  const sorted = out.sort((a, b) => b.profit.navValue - a.profit.navValue);
  return {
    data: sorted,
    debugTimings:
      opts?.debug && uniqueCodes.length > 0
        ? {
            uniqueFundCodes: uniqueCodes.length,
            quoteMsTotal,
            quoteMsAvg,
            quoteMsMax,
            quotePerCode: perCode,
          }
        : undefined,
  };
}

export type HoldingLookupRow = {
  id: string;
  accountId: string;
  shares: string;
  costPrice: string;
};

/** 按基金代码查找用户持仓（跨账户，用于搜索页编辑/移动） */
export async function findHoldingByFundCodeForUser(
  userId: string,
  fundCode: string,
): Promise<HoldingLookupRow | null> {
  const code = fundCode.trim();
  if (!code) return null;
  const row = await prisma.holding.findFirst({
    where: { userId, fund: { code } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, accountId: true, shares: true, costPrice: true },
  });
  if (!row) return null;
  const accounts = await listAccountsForUser(userId);
  const fallbackAccountId = accounts[0]?.id ?? "";
  return {
    id: row.id,
    accountId: row.accountId ?? fallbackAccountId,
    shares: row.shares.toString(),
    costPrice: row.costPrice.toString(),
  };
}

/** 按基金代码 + 指定账户 查找用户持仓（用于详情页分别编辑同基金的不同账户持仓） */
export async function findHoldingByFundCodeForUserAndAccount(
  userId: string,
  fundCode: string,
  accountId?: string | null,
): Promise<HoldingLookupRow | null> {
  const code = fundCode.trim();
  const acc = accountId?.trim();
  if (!code || !acc) return null;
  const row = await prisma.holding.findFirst({
    where: { userId, accountId: acc, fund: { code } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, accountId: true, shares: true, costPrice: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.accountId ?? acc,
    shares: row.shares.toString(),
    costPrice: row.costPrice.toString(),
  };
}

export type HoldingsImportResult = {
  created: number;
  updated: number;
  watchlistSynced: number;
  errors: string[];
};

/** 批量导入：同代码已存在则更新份额与成本；可选同步到自选「全部」分组 */
export async function importHoldingsBatch(
  userId: string,
  items: { fundCode: string; fundName?: string; shares: number; costPrice: number }[],
  options?: { syncWatchlist?: boolean; accountId?: string },
): Promise<HoldingsImportResult> {
  const result: HoldingsImportResult = {
    created: 0,
    updated: 0,
    watchlistSynced: 0,
    errors: [],
  };

  let defaultGroupId: string | null = null;
  const activeAccountId = await resolveAccountIdForUser(userId, options?.accountId);

  if (options?.syncWatchlist) {
    const def = await ensureDefaultWatchlistGroup(userId);
    defaultGroupId = def.id;
  }

  for (const item of items) {
    const code = item.fundCode.trim();
    try {
      // 截图导入也必须先为基金配置“小类”
      const fundCategory = await prisma.fund.findUnique({
        where: { code },
        select: { categoryId: true, category: { select: { parentId: true } } },
      });
      const isSmallCategory = !!fundCategory?.categoryId && fundCategory?.category?.parentId !== null;
      if (!isSmallCategory) {
        throw new Error("加入持仓失败：请先为基金设置“小类”（大类不能直接使用）。");
      }

      const existing =
        activeAccountId &&
        (await prisma.holding.findFirst({
          where: { userId, accountId: activeAccountId, fund: { code } },
          select: { id: true },
        }));
      if (existing) {
        await updateHolding(userId, existing.id, {
          shares: item.shares,
          costPrice: item.costPrice,
        });
        result.updated++;
      } else {
        await createHolding(userId, {
          fundCode: code,
          fundName: item.fundName,
          shares: item.shares,
          costPrice: item.costPrice,
          accountId: activeAccountId ?? undefined,
        });
        result.created++;
      }
      if (defaultGroupId) {
        await addWatchlistItem(userId, {
          fundCode: code,
          fundName: item.fundName,
          groupIds: [defaultGroupId],
        });
        result.watchlistSynced++;
      }
    } catch (e) {
      result.errors.push(
        `${code}: ${e instanceof Error ? e.message : "未知错误"}`,
      );
    }
  }

  return result;
}

export async function createHolding(
  userId: string,
  input: { fundCode: string; fundName?: string; shares: number; costPrice: number; accountId?: string },
) {
  const code = input.fundCode.trim();
  const quote = await getFundQuote(code);
  const name = input.fundName?.trim() || quote.fundName || `基金 ${code}`;

  const fund = await prisma.fund.upsert({
    where: { code },
    update: { name },
    create: { code, name },
  });

  // 加入持仓前：基金必须先设置为“小类”（parentId != null）
  const fundCategory = await prisma.fund.findUnique({
    where: { id: fund.id },
    select: { categoryId: true, category: { select: { parentId: true } } },
  });

  const isSmallCategory = !!fundCategory?.categoryId && fundCategory?.category?.parentId !== null;
  if (!isSmallCategory) {
    throw new Error("加入持仓失败：请先为基金设置“小类”（大类不能直接使用）。");
  }

  const activeAccountId = await resolveAccountIdForUser(userId, input.accountId);

  return prisma.holding.create({
    data: {
      userId,
      accountId: activeAccountId ?? undefined,
      fundId: fund.id,
      shares: new Prisma.Decimal(input.shares),
      costPrice: new Prisma.Decimal(input.costPrice),
      sortOrder: null,
    },
    include: { fund: true },
  });
}

export async function updateHolding(
  userId: string,
  holdingId: string,
  input: { shares?: number; costPrice?: number; accountId?: string },
) {
  const existing = await prisma.holding.findFirst({
    where: { id: holdingId, userId },
  });
  if (!existing) {
    return null;
  }
  const data: {
    shares?: Prisma.Decimal;
    costPrice?: Prisma.Decimal;
    accountId?: string;
  } = {};
  if (input.shares !== undefined) {
    data.shares = new Prisma.Decimal(input.shares);
  }
  if (input.costPrice !== undefined) {
    data.costPrice = new Prisma.Decimal(input.costPrice);
  }
  if (input.accountId !== undefined) {
    const targetAccountId = await resolveAccountIdForUser(userId, input.accountId);
    if (targetAccountId && targetAccountId !== existing.accountId) {
      const conflict = await prisma.holding.findFirst({
        where: {
          userId,
          accountId: targetAccountId,
          fundId: existing.fundId,
          NOT: { id: holdingId },
        },
        select: { id: true },
      });
      if (conflict) {
        throw new HoldingMoveConflictError();
      }
      data.accountId = targetAccountId;
    }
  }
  return prisma.holding.update({
    where: { id: holdingId },
    data,
    include: { fund: true },
  });
}

export async function deleteHolding(userId: string, holdingId: string) {
  const existing = await prisma.holding.findFirst({
    where: { id: holdingId, userId },
  });
  if (!existing) {
    return false;
  }
  await prisma.holding.delete({ where: { id: holdingId } });
  return true;
}

export async function reorderHoldings(userId: string, ids: string[]) {
  const rows = await prisma.holding.findMany({
    where: { userId, id: { in: ids } },
    select: { id: true },
  });
  if (rows.length !== ids.length) {
    return false;
  }
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.holding.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );
  return true;
}
