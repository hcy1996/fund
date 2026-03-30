import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteAccountForUser } from "@/services/accountService";

type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const ok = await deleteAccountForUser(session.user.id, id);
    if (!ok) {
      return NextResponse.json({ error: "未找到账户" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "删除失败" },
      { status: 400 },
    );
  }
}

