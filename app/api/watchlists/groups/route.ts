import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { DEFAULT_WATCHLIST_GROUP_NAME } from "@/lib/watchlistConstants";
import {
  createWatchlistGroup,
  listWatchlistGroups,
} from "@/services/watchlistService";
import { watchlistGroupCreateSchema } from "@/lib/validations";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const data = await listWatchlistGroups(session.user.id);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const parsed = watchlistGroupCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  if (parsed.data.name.trim() === DEFAULT_WATCHLIST_GROUP_NAME) {
    return NextResponse.json(
      { error: `不能使用保留分组名「${DEFAULT_WATCHLIST_GROUP_NAME}」` },
      { status: 400 },
    );
  }
  const row = await createWatchlistGroup(session.user.id, parsed.data);
  if (!row) {
    return NextResponse.json(
      { error: `不能使用保留分组名「${DEFAULT_WATCHLIST_GROUP_NAME}」` },
      { status: 400 },
    );
  }
  return NextResponse.json(row, { status: 201 });
}
