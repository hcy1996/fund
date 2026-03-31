import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WATCHLIST_GROUP_NAME } from "@/lib/watchlistConstants";
import { getFundQuote } from "@/services/fundQuoteService";
import type { WatchlistGroupedDto } from "@/types/watchlist";

function sortGroupsDefaultFirst<T extends { name: string; sortOrder: number }>(rows: T[]): T[] {
  const def = rows.filter((g) => g.name === DEFAULT_WATCHLIST_GROUP_NAME);
  const rest = rows
    .filter((g) => g.name !== DEFAULT_WATCHLIST_GROUP_NAME)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return [...def, ...rest];
}

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

export async function ensureDefaultWatchlistGroup(userId: string) {
  return prisma.watchlistGroup.upsert({
    where: { userId_name: { userId, name: DEFAULT_WATCHLIST_GROUP_NAME } },
    update: { sortOrder: 0 },
    create: {
      userId,
      name: DEFAULT_WATCHLIST_GROUP_NAME,
      sortOrder: 0,
    },
    select: { id: true, name: true, sortOrder: true },
  });
}

export type UpdateWatchlistGroupResult =
  | { ok: true; group: { id: string; name: string; sortOrder: number } }
  | {
      ok: false;
      error: "not_found" | "reserved_rename" | "name_reserved" | "duplicate";
    };

export async function listWatchlistGroups(userId: string) {
  const rows = await prisma.watchlistGroup.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, sortOrder: true },
  });
  return sortGroupsDefaultFirst(rows);
}

export async function createWatchlistGroup(
  userId: string,
  input: { name: string; sortOrder?: number },
) {
  const trimmedName = input.name.trim();
  if (trimmedName === DEFAULT_WATCHLIST_GROUP_NAME) {
    return null;
  }
  const agg = await prisma.watchlistGroup.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  const nextOrder =
    input.sortOrder ?? (agg._max.sortOrder !== null ? agg._max.sortOrder + 1 : 1);
  return prisma.watchlistGroup.create({
    data: {
      userId,
      name: trimmedName,
      sortOrder: nextOrder,
    },
    select: { id: true, name: true, sortOrder: true },
  });
}

export async function updateWatchlistGroup(
  userId: string,
  groupId: string,
  input: { name?: string; sortOrder?: number },
): Promise<UpdateWatchlistGroupResult> {
  const existing = await prisma.watchlistGroup.findFirst({
    where: { id: groupId, userId },
    select: { id: true, name: true },
  });
  if (!existing) {
    return { ok: false, error: "not_found" };
  }

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (
      existing.name === DEFAULT_WATCHLIST_GROUP_NAME &&
      trimmed !== DEFAULT_WATCHLIST_GROUP_NAME
    ) {
      return { ok: false, error: "reserved_rename" };
    }
    if (
      existing.name !== DEFAULT_WATCHLIST_GROUP_NAME &&
      trimmed === DEFAULT_WATCHLIST_GROUP_NAME
    ) {
      return { ok: false, error: "name_reserved" };
    }
  }

  const data: { name?: string; sortOrder?: number } = {};
  if (input.name !== undefined) {
    data.name = input.name.trim();
  }
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder;
  }

  try {
    const group = await prisma.watchlistGroup.update({
      where: { id: groupId },
      data,
      select: { id: true, name: true, sortOrder: true },
    });
    return { ok: true, group };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "duplicate" };
    }
    throw e;
  }
}

export type DeleteWatchlistGroupResult = "ok" | "not_found" | "reserved";

export async function deleteWatchlistGroup(
  userId: string,
  groupId: string,
): Promise<DeleteWatchlistGroupResult> {
  const existing = await prisma.watchlistGroup.findFirst({
    where: { id: groupId, userId },
    select: { id: true, name: true },
  });
  if (!existing) {
    return "not_found";
  }
  if (existing.name === DEFAULT_WATCHLIST_GROUP_NAME) {
    return "reserved";
  }

  await prisma.$transaction(async (tx) => {
    await tx.watchlistGroup.delete({ where: { id: groupId } });

    const orphanIds = await tx.watchlistItem.findMany({
      where: {
        userId,
        memberships: { none: {} },
      },
      select: { id: true },
    });
    if (orphanIds.length > 0) {
      await tx.watchlistItem.deleteMany({
        where: { id: { in: orphanIds.map((x) => x.id) } },
      });
    }
  });

  const left = await prisma.watchlistGroup.count({ where: { userId } });
  if (left === 0) {
    await ensureDefaultWatchlistGroup(userId);
  }
  return "ok";
}

export async function reorderWatchlistGroups(userId: string, ids: string[]) {
  const groups = await prisma.watchlistGroup.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  if (groups.length === 0 || groups.length !== ids.length) {
    return false;
  }
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) {
    return false;
  }
  for (const g of groups) {
    if (!idSet.has(g.id)) {
      return false;
    }
  }
  const defaultG = groups.find((g) => g.name === DEFAULT_WATCHLIST_GROUP_NAME);
  let finalOrder: string[];
  if (defaultG) {
    const others = ids.filter((id) => id !== defaultG.id);
    const expectedOthers = new Set(groups.filter((g) => g.id !== defaultG.id).map((g) => g.id));
    if (others.length !== expectedOthers.size || !others.every((id) => expectedOthers.has(id))) {
      return false;
    }
    finalOrder = [defaultG.id, ...others];
  } else {
    finalOrder = ids;
  }
  await prisma.$transaction(
    finalOrder.map((id, index) =>
      prisma.watchlistGroup.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );
  return true;
}

export async function getWatchlistMembershipForFund(userId: string, fundCode: string) {
  const code = fundCode.trim();
  const item = await prisma.watchlistItem.findUnique({
    where: { userId_fundCode: { userId, fundCode: code } },
    select: { id: true },
  });
  if (!item) {
    return { itemId: null as string | null, groupIds: [] as string[] };
  }
  const links = await prisma.watchlistItemGroup.findMany({
    where: { itemId: item.id },
    select: { groupId: true },
  });
  return { itemId: item.id, groupIds: links.map((l) => l.groupId) };
}

export async function syncWatchlistItemGroups(
  userId: string,
  input: { fundCode: string; fundName?: string; groupIds: string[] },
) {
  const code = input.fundCode.trim();
  const quote = await getFundQuote(code);
  const name = input.fundName?.trim() || quote.fundName || `基金 ${code}`;

  const item = await prisma.watchlistItem.upsert({
    where: { userId_fundCode: { userId, fundCode: code } },
    update: { fundName: name },
    create: { userId, fundCode: code, fundName: name },
    select: { id: true },
  });

  let effectiveIds: string[];
  if (input.groupIds.length > 0) {
    effectiveIds = input.groupIds;
  } else {
    const defaultRow = await prisma.watchlistGroup.findFirst({
      where: { userId, name: DEFAULT_WATCHLIST_GROUP_NAME },
      select: { id: true },
    });
    effectiveIds = defaultRow ? [defaultRow.id] : [];
  }

  const validGroups = await prisma.watchlistGroup.findMany({
    where: { userId, id: { in: effectiveIds } },
    select: { id: true },
  });
  const validIdSet = new Set(validGroups.map((g) => g.id));

  const existing = await prisma.watchlistItemGroup.findMany({
    where: { itemId: item.id, group: { userId } },
    select: { id: true, groupId: true },
  });

  const desired = new Set(effectiveIds.filter((id) => validIdSet.has(id)));
  const toRemove = existing.filter((e) => !desired.has(e.groupId));
  const existingGroupIds = new Set(existing.map((e) => e.groupId));
  const toAdd = [...desired].filter((id) => !existingGroupIds.has(id));

  await prisma.$transaction([
    ...toRemove.map((m) => prisma.watchlistItemGroup.delete({ where: { id: m.id } })),
    ...toAdd.map((groupId) =>
      prisma.watchlistItemGroup.upsert({
        where: { groupId_itemId: { groupId, itemId: item.id } },
        update: {},
        create: { groupId, itemId: item.id },
      }),
    ),
  ]);

  const remainingLinks = await prisma.watchlistItemGroup.count({ where: { itemId: item.id } });
  if (remainingLinks === 0) {
    await prisma.watchlistItem.delete({ where: { id: item.id } });
  }

  return item;
}

export async function addWatchlistItem(
  userId: string,
  input: { fundCode: string; fundName?: string; groupIds: string[] },
) {
  const code = input.fundCode.trim();
  const quote = await getFundQuote(code);
  const name = input.fundName?.trim() || quote.fundName || `基金 ${code}`;

  const item = await prisma.watchlistItem.upsert({
    where: { userId_fundCode: { userId, fundCode: code } },
    update: { fundName: name },
    create: { userId, fundCode: code, fundName: name },
    select: { id: true, fundCode: true, fundName: true },
  });

  const groups = await prisma.watchlistGroup.findMany({
    where: { userId, id: { in: input.groupIds } },
    select: { id: true },
  });
  if (groups.length > 0) {
    await prisma.watchlistItemGroup.createMany({
      data: groups.map((g) => ({ groupId: g.id, itemId: item.id })),
      skipDuplicates: true,
    });
  }

  return item;
}

export async function removeWatchlistItem(userId: string, itemId: string) {
  const existing = await prisma.watchlistItem.findFirst({
    where: { id: itemId, userId },
    select: { id: true },
  });
  if (!existing) {
    return false;
  }
  await prisma.watchlistItem.delete({ where: { id: itemId } });
  return true;
}

export async function removeWatchlistItemFromGroup(
  userId: string,
  input: { itemId: string; groupId: string },
) {
  const membership = await prisma.watchlistItemGroup.findFirst({
    where: {
      itemId: input.itemId,
      groupId: input.groupId,
      group: { userId },
      item: { userId },
    },
    select: { id: true },
  });
  if (!membership) {
    return false;
  }

  await prisma.$transaction(async (tx) => {
    await tx.watchlistItemGroup.delete({ where: { id: membership.id } });

    const remaining = await tx.watchlistItemGroup.findMany({
      where: { itemId: input.itemId },
      include: { group: { select: { name: true } } },
    });

    const hasCustom = remaining.some((m) => m.group.name !== DEFAULT_WATCHLIST_GROUP_NAME);
    if (!hasCustom) {
      const defaultIds = remaining
        .filter((x) => x.group.name === DEFAULT_WATCHLIST_GROUP_NAME)
        .map((x) => x.id);
      if (defaultIds.length > 0) {
        await tx.watchlistItemGroup.deleteMany({ where: { id: { in: defaultIds } } });
      }
    }

    const left = await tx.watchlistItemGroup.count({ where: { itemId: input.itemId } });
    if (left === 0) {
      await tx.watchlistItem.delete({ where: { id: input.itemId } });
    }
  });

  return true;
}

function groupLabelsExcludingDefault(
  memberships: Array<{ group: { name: string } }>,
): string[] {
  const names = memberships
    .map((m) => m.group.name)
    .filter((n) => n !== DEFAULT_WATCHLIST_GROUP_NAME);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export async function listWatchlistGrouped(userId: string): Promise<WatchlistGroupedDto> {
  const rawGroups = await prisma.watchlistGroup.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      memberships: {
        include: {
          item: true,
        },
      },
    },
  });
  const groups = sortGroupsDefaultFirst(rawGroups);

  const allItems = await prisma.watchlistItem.findMany({
    where: { userId },
    include: {
      memberships: {
        include: { group: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ fundName: "asc" }],
  });

  const codeSet = new Set<string>();
  for (const it of allItems) {
    codeSet.add(it.fundCode);
  }
  for (const g of groups) {
    for (const m of g.memberships) {
      codeSet.add(m.item.fundCode);
    }
  }

  const quoteConcurrency = Number(process.env.FUND_QUOTE_CONCURRENCY_LIMIT ?? 6);
  const quoteEntries = await mapWithConcurrencyLimit(
    Array.from(codeSet),
    quoteConcurrency,
    async (code) => [code, await getFundQuote(code)] as const,
  );
  const quoteMap = new Map(quoteEntries);

  return {
    groups: groups.map((g) => {
      if (g.name === DEFAULT_WATCHLIST_GROUP_NAME) {
        return {
          id: g.id,
          name: g.name,
          sortOrder: g.sortOrder,
          items: allItems.map((it) => ({
            id: it.id,
            fundCode: it.fundCode,
            fundName: it.fundName,
            quote: quoteMap.get(it.fundCode),
            groupLabels: groupLabelsExcludingDefault(it.memberships),
          })),
        };
      }
      return {
        id: g.id,
        name: g.name,
        sortOrder: g.sortOrder,
        items: g.memberships.map((m) => ({
          id: m.item.id,
          fundCode: m.item.fundCode,
          fundName: m.item.fundName,
          quote: quoteMap.get(m.item.fundCode),
        })),
      };
    }),
  };
}
