import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fundCategoryUpdateSchema } from "@/lib/validations";
import { deleteFundCategory, updateFundCategory } from "@/services/fundCategoryService";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: RouteCtx) {
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

  const parsed = fundCategoryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { id } = await ctx.params;

  try {
    const row = await updateFundCategory(id, parsed.data);
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "更新失败" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const ok = await deleteFundCategory(id);
  if (!ok) return NextResponse.json({ error: "未找到" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
