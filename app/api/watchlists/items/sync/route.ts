import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { watchlistItemSyncGroupsSchema } from "@/lib/validations";
import { syncWatchlistItemGroups } from "@/services/watchlistService";

export async function PUT(req: Request) {
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
  const parsed = watchlistItemSyncGroupsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  await syncWatchlistItemGroups(session.user.id, parsed.data);
  return NextResponse.json({ ok: true });
}
