import { prisma } from "@/lib/prisma";

export async function recordFundSearchHot(userId: string, fundCode: string) {
  // fundCode: 6-digit numeric code; keep as string without assuming a Fund row exists.
  const code = fundCode.trim();
  if (!/^\d{6}$/.test(code)) return;

  const existing = await prisma.fundSearchHot.findUnique({
    where: { userId_fundCode: { userId, fundCode: code } },
  });

  if (existing) {
    await prisma.fundSearchHot.update({
      where: { userId_fundCode: { userId, fundCode: code } },
      data: {
        count: existing.count + 1,
        lastSearchedAt: new Date(),
      },
    });
    return;
  }

  await prisma.fundSearchHot.create({
    data: {
      userId,
      fundCode: code,
      count: 1,
      lastSearchedAt: new Date(),
    },
  });
}

export async function getFundSearchHotCounts(userId: string, limit = 20) {
  const rows = await prisma.fundSearchHot.findMany({
    where: { userId },
    orderBy: { count: "desc" },
    take: limit,
    select: { fundCode: true, count: true },
  });

  const map: Record<string, number> = {};
  for (const row of rows) map[row.fundCode] = row.count;
  return map;
}

