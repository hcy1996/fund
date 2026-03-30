import { searchFundsEastMoney } from "@/lib/eastmoneyFundSearch";
import type { FundSearchHit } from "@/lib/eastmoneyFundSearch";
import { getFundSearchHotCounts } from "@/services/fundSearchHotService";

export async function searchFundsForUser(q: string, limit: number, userId?: string | null) {
  const list = await searchFundsEastMoney(q, limit);

  if (!userId) {
    return list;
  }

  const hotMap = await getFundSearchHotCounts(userId, 50);

  // Attach hotCount for frontend ranking.
  return list.map((item) => ({
    ...item,
    hotCount: hotMap[item.code],
  }));
}

export type FundSearchItemWithHot = FundSearchHit & { hotCount?: number };

