import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchFundsForUser } from "@/services/fundSearchService";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json([]);
  }
  const session = await auth();
  const list = await searchFundsForUser(q, 10, session?.user?.id);
  return NextResponse.json(list, {
    headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
    },
  });
}
