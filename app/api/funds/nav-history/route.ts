import { NextResponse } from "next/server";
import { fundNavHistoryQuerySchema } from "@/lib/validations";
import { getFundNavHistory } from "@/services/fundNavHistoryService";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const r = searchParams.get("range");
  const parsed = fundNavHistoryQuerySchema.safeParse({
    code: searchParams.get("code") ?? "",
    range: r && r.length > 0 ? r : undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const data = await getFundNavHistory(parsed.data.code, parsed.data.range);
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
