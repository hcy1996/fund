import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { watchlistGroupReorderSchema } from "@/lib/validations";
import { reorderWatchlistGroups } from "@/services/watchlistService";

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
  const parsed = watchlistGroupReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const ok = await reorderWatchlistGroups(session.user.id, parsed.data.ids);
  if (!ok) {
    return NextResponse.json({ error: "排序失败" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
