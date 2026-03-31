import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { holdingsImportBodySchema } from "@/lib/validations";
import { importHoldingsBatch } from "@/services/holdingService";

export const POST = withAuth(async (req, _ctx, userId) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const parsed = holdingsImportBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { items, syncWatchlist, accountId } = parsed.data;
  const result = await importHoldingsBatch(userId, items, { syncWatchlist, accountId });
  return NextResponse.json(result);
});
