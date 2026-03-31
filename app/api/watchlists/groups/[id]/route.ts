import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { DEFAULT_WATCHLIST_GROUP_NAME } from "@/lib/watchlistConstants";
import {
  deleteWatchlistGroup,
  updateWatchlistGroup,
} from "@/services/watchlistService";
import { watchlistGroupUpdateSchema } from "@/lib/validations";

type RouteCtx = { params: Promise<{ id: string }> };

export const PUT = withAuth(async (req, ctx: RouteCtx, userId) => {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const parsed = watchlistGroupUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  if (parsed.data.name === undefined && parsed.data.sortOrder === undefined) {
    return NextResponse.json({ error: "无更新字段" }, { status: 400 });
  }
  const result = await updateWatchlistGroup(userId, id, parsed.data);
  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "分组不存在" }, { status: 404 });
    }
    const msg =
      result.error === "reserved_rename"
        ? `「${DEFAULT_WATCHLIST_GROUP_NAME}」为系统分组，不可改名`
        : result.error === "name_reserved"
          ? `不能使用保留分组名「${DEFAULT_WATCHLIST_GROUP_NAME}」`
          : "已存在同名分组";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json(result.group);
});

export const DELETE = withAuth(async (_req, ctx: RouteCtx, userId) => {
  const { id } = await ctx.params;
  const result = await deleteWatchlistGroup(userId, id);
  if (result === "not_found") {
    return NextResponse.json({ error: "分组不存在" }, { status: 404 });
  }
  if (result === "reserved") {
    return NextResponse.json(
      { error: `「${DEFAULT_WATCHLIST_GROUP_NAME}」为系统分组，不可删除` },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
});
