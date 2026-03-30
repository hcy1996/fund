import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findHoldingByFundCodeForUser, findHoldingByFundCodeForUserAndAccount } from "@/services/holdingService";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const fundCode = searchParams.get("fundCode")?.trim() ?? "";
  const accountId = searchParams.get("accountId")?.trim() ?? undefined;
  if (!fundCode) {
    return NextResponse.json({ error: "缺少 fundCode" }, { status: 400 });
  }
  const holding =
    accountId && accountId.length > 0
      ? await findHoldingByFundCodeForUserAndAccount(session.user.id, fundCode, accountId)
      : await findHoldingByFundCodeForUser(session.user.id, fundCode);
  return NextResponse.json({ holding });
}
