import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { HoldingMoveConflictError } from "@/lib/holdingErrors";
import { updateHolding, deleteHolding } from "@/services/holdingService";
import { holdingUpdateSchema } from "@/lib/validations";

type RouteCtx = { params: Promise<{ id: string }> };

export const PUT = withAuth(async (req, ctx: RouteCtx, userId) => {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const parsed = holdingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { shares, costPrice, accountId } = parsed.data;
  if (shares === undefined && costPrice === undefined && accountId === undefined) {
    return NextResponse.json({ error: "无更新字段" }, { status: 400 });
  }
  let row;
  try {
    row = await updateHolding(userId, id, parsed.data);
  } catch (e) {
    if (e instanceof HoldingMoveConflictError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
  if (!row) {
    return NextResponse.json({ error: "未找到持仓" }, { status: 404 });
  }
  return NextResponse.json(row);
});

export const DELETE = withAuth(async (_req, ctx: RouteCtx, userId) => {
  const { id } = await ctx.params;
  const ok = await deleteHolding(userId, id);
  if (!ok) {
    return NextResponse.json({ error: "未找到持仓" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
});
