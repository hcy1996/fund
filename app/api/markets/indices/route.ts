import { NextResponse } from "next/server";
import { listMarketIndices } from "@/services/marketIndexService";

export async function GET() {
  const indices = await listMarketIndices();
  return NextResponse.json({
    asOf: new Date().toISOString(),
    indices,
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
    },
  });
}
