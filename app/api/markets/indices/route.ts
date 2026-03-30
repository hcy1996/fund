import { NextResponse } from "next/server";
import { listMarketIndices } from "@/services/marketIndexService";

export async function GET() {
  const indices = await listMarketIndices();
  return NextResponse.json({
    asOf: new Date().toISOString(),
    indices,
  });
}

