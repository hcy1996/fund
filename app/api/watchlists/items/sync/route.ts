import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { watchlistItemSyncGroupsSchema } from "@/lib/validations";
import { syncWatchlistItemGroups } from "@/services/watchlistService";

export const PUT = withAuth(async (req, _ctx, userId) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const parsed = watchlistItemSyncGroupsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  await syncWatchlistItemGroups(userId, parsed.data);
  return NextResponse.json({ ok: true });
});
