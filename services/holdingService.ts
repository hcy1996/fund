import { prisma } from "@/lib/prisma";
import { HoldingMoveConflictError } from "@/lib/holdingErrors";
import { listAccountsForUser, resolveAccountIdForUser } from "@/services/accountService";
import { getFundQuote } from "@/services/fundQuoteService";
import { addWatchlistItem, ensureDefaultWatchlistGroup } from "@/services/watchlistService";
import type { HoldingWithProfit } from "@/types/holding";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";

export type { HoldingWithProfit };

export async function listHoldingsForUser(
  userId: string,
  accountId?: string,
): Promise<HoldingWithProfit[]> {
  let targetAccountId = accountId;
  if (!targetAccountId) {
    const accounts = await listAccountsForUser(userId);
    targetAccountId = accounts[0]?.id;
  }
  const rows = await prisma.holding.findMany({
    where: { userId, accountId: targetAccountId },
    include: { fund: true },
  });

  const quotes = await Promise.all(rows.map((h) => getFundQuote(h.fund.code)));
  const out: HoldingWithProfit[] = [];
  for (let i = 0; i < rows.length; i++) {
    const h = rows[i]!;
    const quote = quotes[i]!;
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
      quote.navSource === "estimate" && quote.officialNav !== undefined
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
      nav: quote.nav,
      dailyChangeRate: dailyRate,
      profit,
    });
  }
  const hasManualOrder = out.some((x) => x.sortOrder !== null && x.sortOrder !== undefined);
  if (hasManualOrder) {
    return out.sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER));
  }
  // 默认按“持有金额(净)”排序，避免盘中估算导致排序与展示不一致
  return out.sort((a, b) => b.profit.navValue - a.profit.navValue);
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
