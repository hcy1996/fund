import { prisma } from "@/lib/prisma";
import { getFundQuote } from "@/services/fundQuoteService";

type Dim = "account" | "owner";

export type HoldingFundStat = {
  code: string;
  name: string;
  value: number;
  pct: number;
  bigName: string;
  smallName: string;
};

export type HoldingStatsByCategory = {
  totalValue: number;
  groups: Array<{
    bigName: string;
    bigValue: number;
    bigPct: number;
    smalls: Array<{
      smallName: string;
      smallValue: number;
      smallPct: number;
      funds: HoldingFundStat[];
    }>;
  }>;
};

const BIG_UNCLASSIFIED = "未分类";
const SMALL_UNCLASSIFIED = "未设置小类";

async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = Math.max(1, Math.floor(limit));
  if (items.length === 0) return [];
  if (n === 1 || items.length === 1) {
    const out: R[] = [];
    for (let i = 0; i < items.length; i++) {
      out.push(await mapper(items[i]!, i));
    }
    return out;
  }

  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await mapper(items[idx]!, idx);
    }
  }

  const workerCount = Math.min(n, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function getHoldingStatsByCategoryForUser(
  userId: string,
  dim: Dim,
  options: { accountId?: string; ownerName?: string },
): Promise<HoldingStatsByCategory> {
  let accountIds: string[] = [];

  if (dim === "account") {
    const accId = options.accountId?.trim();
    if (!accId) {
      return { totalValue: 0, groups: [] };
    }
    const acc = await prisma.account.findFirst({
      where: { id: accId, userId },
      select: { id: true },
    });
    if (!acc) {
      return { totalValue: 0, groups: [] };
    }
    accountIds = [acc.id];
  } else {
    const ownerName = options.ownerName?.trim();
    if (!ownerName) {
      return { totalValue: 0, groups: [] };
    }
    const accounts = await prisma.account.findMany({
      where: { userId, owner: ownerName },
      select: { id: true },
    });
    accountIds = accounts.map((a) => a.id);
    if (accountIds.length === 0) {
      return { totalValue: 0, groups: [] };
    }
  }

  const holdings = await prisma.holding.findMany({
    where: { userId, accountId: { in: accountIds } },
    include: {
      fund: {
        include: {
          category: {
            include: { parent: true },
          },
        },
      },
    },
  });

  if (holdings.length === 0) {
    return { totalValue: 0, groups: [] };
  }

  // 1. 按 fundCode 汇总份额与引用信息
  const byCode = new Map<
    string,
    {
      fundId: string;
      fundCode: string;
      fundName: string;
      shares: number;
      categoryId: string | null;
      bigName: string;
      smallName: string;
    }
  >();

  for (const h of holdings) {
    const fundCode = h.fund.code;
    const exist = byCode.get(fundCode);

    const shares = Number(h.shares);
    if (!Number.isFinite(shares)) continue;

    let bigName = BIG_UNCLASSIFIED;
    let smallName = SMALL_UNCLASSIFIED;
    const cat = h.fund.category;

    if (cat && cat.parent) {
      bigName = cat.parent.name;
      smallName = cat.name;
    }

    if (!exist) {
      byCode.set(fundCode, {
        fundId: h.fundId,
        fundCode,
        fundName: h.fund.name,
        shares,
        categoryId: h.fund.categoryId,
        bigName,
        smallName,
      });
    } else {
      exist.shares += shares;
    }
  }

  if (byCode.size === 0) {
    return { totalValue: 0, groups: [] };
  }

  // 2. 拉取 quote 计算金额
  const quoteConcurrency = Number(process.env.FUND_QUOTE_CONCURRENCY_LIMIT ?? 6);
  const items = Array.from(byCode.values());
  const stats = await mapWithConcurrencyLimit(items, quoteConcurrency, async (item) => {
    const quote = await getFundQuote(item.fundCode);
    const shares = item.shares;

    const dailyNav = quote.nav ?? quote.officialNav ?? quote.estimateNav ?? 0;
    const totalNav =
      quote.navSource !== "official" && quote.officialNav !== undefined
        ? quote.officialNav
        : dailyNav;

    const value = Number.isFinite(totalNav) ? shares * Number(totalNav) : 0;
    return {
      code: item.fundCode,
      name: quote.fundName || item.fundName,
      value,
      pct: 0,
      bigName: item.bigName,
      smallName: item.smallName,
    } satisfies HoldingFundStat;
  });

  const totalValue = stats.reduce((sum, s) => sum + s.value, 0);
  if (totalValue <= 0) {
    return { totalValue: 0, groups: [] };
  }

  for (const s of stats) {
    s.pct = s.value / totalValue;
  }

  // 3. 分组 + 小计
  const byBig = new Map<
    string,
    {
      bigName: string;
      funds: HoldingFundStat[];
    }
  >();

  for (const s of stats) {
    const key = s.bigName || BIG_UNCLASSIFIED;
    const group = byBig.get(key);
    if (group) {
      group.funds.push(s);
    } else {
      byBig.set(key, { bigName: key, funds: [s] });
    }
  }

  const groups: HoldingStatsByCategory["groups"] = [];

  for (const big of byBig.values()) {
    const bySmall = new Map<
      string,
      {
        smallName: string;
        funds: HoldingFundStat[];
      }
    >();

    for (const f of big.funds) {
      const skey = f.smallName || SMALL_UNCLASSIFIED;
      const sGroup = bySmall.get(skey);
      if (sGroup) {
        sGroup.funds.push(f);
      } else {
        bySmall.set(skey, { smallName: skey, funds: [f] });
      }
    }

    const smallsArr: HoldingStatsByCategory["groups"][number]["smalls"] = [];
    let bigValue = 0;

    for (const small of bySmall.values()) {
      small.funds.sort((a, b) => b.value - a.value);
      const smallValue = small.funds.reduce((sum, f) => sum + f.value, 0);
      bigValue += smallValue;
      smallsArr.push({
        smallName: small.smallName,
        smallValue,
        smallPct: smallValue / totalValue,
        funds: small.funds,
      });
    }

    // 小类排序：未分类置底
    smallsArr.sort((a, b) => {
      if (a.smallName === SMALL_UNCLASSIFIED && b.smallName !== SMALL_UNCLASSIFIED) return 1;
      if (a.smallName !== SMALL_UNCLASSIFIED && b.smallName === SMALL_UNCLASSIFIED) return -1;
      return a.smallName.localeCompare(b.smallName, "zh-CN");
    });

    groups.push({
      bigName: big.bigName,
      bigValue,
      bigPct: bigValue / totalValue,
      smalls: smallsArr,
    });
  }

  // 大类排序：未分类置底
  groups.sort((a, b) => {
    if (a.bigName === BIG_UNCLASSIFIED && b.bigName !== BIG_UNCLASSIFIED) return 1;
    if (a.bigName !== BIG_UNCLASSIFIED && b.bigName === BIG_UNCLASSIFIED) return -1;
    return a.bigName.localeCompare(b.bigName, "zh-CN");
  });

  return { totalValue, groups };
}
