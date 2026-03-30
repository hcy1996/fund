import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getWatchlistMembershipForFund } from "@/services/watchlistService";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const fundCode = searchParams.get("fundCode")?.trim();
  if (!fundCode) {
    return NextResponse.json({ error: "缺少 fundCode" }, { status: 400 });
  }
  const data = await getWatchlistMembershipForFund(session.user.id, fundCode);
  return NextResponse.json(data);
}
