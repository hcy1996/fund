import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { getWatchlistMembershipForFund } from "@/services/watchlistService";

export const GET = withAuth(async (req, _ctx, userId) => {
  const { searchParams } = new URL(req.url);
  const fundCode = searchParams.get("fundCode")?.trim();
  if (!fundCode) {
    return NextResponse.json({ error: "缺少 fundCode" }, { status: 400 });
  }
  const data = await getWatchlistMembershipForFund(userId, fundCode);
  return NextResponse.json(data);
});
