import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { removeWatchlistItem } from "@/services/watchlistService";

type RouteCtx = { params: Promise<{ id: string }> };

export const DELETE = withAuth(async (_req, ctx: RouteCtx, userId) => {
  const { id } = await ctx.params;
  const ok = await removeWatchlistItem(userId, id);
  if (!ok) {
    return NextResponse.json({ error: "自选不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
});
