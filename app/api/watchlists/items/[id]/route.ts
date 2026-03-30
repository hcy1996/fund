import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { removeWatchlistItem } from "@/services/watchlistService";

type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const ok = await removeWatchlistItem(session.user.id, id);
  if (!ok) {
    return NextResponse.json({ error: "自选不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
