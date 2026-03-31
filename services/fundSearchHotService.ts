import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type FundSearchHotRepo = Pick<typeof prisma.fundSearchHot, "upsert">;

const defaultRepo: FundSearchHotRepo = prisma.fundSearchHot;

export async function recordFundSearchHotWithRepo(
  repo: FundSearchHotRepo,
  userId: string,
  fundCode: string,
) {
  const code = fundCode.trim();
  if (!/^\d{6}$/.test(code)) return;

  await repo.upsert({
    where: { userId_fundCode: { userId, fundCode: code } },
    create: {
      userId,
      fundCode: code,
      count: 1,
      lastSearchedAt: new Date(),
    },
    update: {
      count: { increment: 1 },
      lastSearchedAt: new Date(),
    },
  });
}

export async function recordFundSearchHot(userId: string, fundCode: string) {
  try {
    await recordFundSearchHotWithRepo(defaultRepo, userId, fundCode);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // 极端并发下兜底：交由后续请求继续累加，不中断主流程
      return;
    }
    throw e;
  }
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
