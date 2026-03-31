import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { findHoldingByFundCodeForUser, findHoldingByFundCodeForUserAndAccount } from "@/services/holdingService";

export const GET = withAuth(async (req, _ctx, userId) => {
  const { searchParams } = new URL(req.url);
  const fundCode = searchParams.get("fundCode")?.trim() ?? "";
  const accountId = searchParams.get("accountId")?.trim() ?? undefined;
  if (!fundCode) {
    return NextResponse.json({ error: "缺少 fundCode" }, { status: 400 });
  }
  const holding =
    accountId && accountId.length > 0
      ? await findHoldingByFundCodeForUserAndAccount(userId, fundCode, accountId)
      : await findHoldingByFundCodeForUser(userId, fundCode);
  return NextResponse.json({ holding });
});
