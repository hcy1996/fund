import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { holdingReorderSchema } from "@/lib/validations";
import { reorderHoldings } from "@/services/holdingService";

export const POST = withAuth(async (req, _ctx, userId) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const parsed = holdingReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const ok = await reorderHoldings(userId, parsed.data.ids);
  if (!ok) {
    return NextResponse.json({ error: "排序失败" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
});
