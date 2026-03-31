import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { deleteAccountForUser, updateAccountForUser } from "@/services/accountService";

type RouteCtx = { params: Promise<{ id: string }> };

export const DELETE = withAuth(async (_req, ctx: RouteCtx, userId) => {
  const { id } = await ctx.params;
  try {
    const ok = await deleteAccountForUser(userId, id);
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
});

export const PUT = withAuth(async (req, ctx: RouteCtx, userId) => {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const inputObj =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};

  const nextName = typeof inputObj.name === "string" ? inputObj.name : undefined;
  const nextOwner = typeof inputObj.owner === "string" ? inputObj.owner : undefined;

  if (nextName === undefined && nextOwner === undefined) {
    return NextResponse.json({ error: "无更新字段" }, { status: 400 });
  }

  const row = await updateAccountForUser(userId, id, {
    name: nextName as string | undefined,
    owner: nextOwner as string | undefined,
  });
  if (!row) {
    return NextResponse.json({ error: "未找到账户" }, { status: 404 });
  }

  return NextResponse.json(row);
});
