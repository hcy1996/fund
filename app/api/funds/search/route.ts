import { NextResponse } from "next/server";
import { searchFundsEastMoney } from "@/lib/eastmoneyFundSearch";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json([]);
  }
  const list = await searchFundsEastMoney(q, 10);
  return NextResponse.json(list, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
