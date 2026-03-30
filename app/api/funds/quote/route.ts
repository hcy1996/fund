import { NextResponse } from "next/server";
import { getFundQuote } from "@/services/fundQuoteService";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code?.trim()) {
    return NextResponse.json({ error: "缺少参数 code" }, { status: 400 });
  }
  const quote = await getFundQuote(code);
  return NextResponse.json(quote, {
    headers: {
      "Cache-Control": "public, s-maxage=25, stale-while-revalidate=60",
    },
  });
}
