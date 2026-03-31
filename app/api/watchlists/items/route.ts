import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import {
  addWatchlistItem,
  listWatchlistGrouped,
  removeWatchlistItemFromGroup,
} from "@/services/watchlistService";
import {
  watchlistItemCreateSchema,
  watchlistItemRemoveFromGroupSchema,
} from "@/lib/validations";

export const GET = withAuth(async (_req, _ctx, userId) => {
  const data = await listWatchlistGrouped(userId);
  return NextResponse.json(data);
});

export const POST = withAuth(async (req, _ctx, userId) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const parsed = watchlistItemCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const row = await addWatchlistItem(userId, parsed.data);
  return NextResponse.json(row, { status: 201 });
});

export const DELETE = withAuth(async (req, _ctx, userId) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const parsed = watchlistItemRemoveFromGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const ok = await removeWatchlistItemFromGroup(userId, parsed.data);
  if (!ok) {
    return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
});
