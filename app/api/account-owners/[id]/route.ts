import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { accountOwnerUpdateSchema } from "@/lib/validations";
import { deleteAccountOwner, updateAccountOwner } from "@/services/accountOwnerService";

type RouteCtx = { params: Promise<{ id: string }> };

export const PUT = withAuth(async (req, ctx: RouteCtx, userId) => {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const parsed = accountOwnerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const row = await updateAccountOwner(userId, id, {
      name: parsed.data.name,
      sortOrder: parsed.data.sortOrder,
    });
    if (!row) return NextResponse.json({ error: "未找到" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "更新失败";
    if (msg.includes("已存在")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
});

export const DELETE = withAuth(async (_req, ctx: RouteCtx, userId) => {
  const { id } = await ctx.params;
  try {
    const ok = await deleteAccountOwner(userId, id);
    if (!ok) return NextResponse.json({ error: "未找到" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "删除失败" }, { status: 400 });
  }
});
