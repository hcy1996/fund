import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { recordFundSearchHot } from "@/services/fundSearchHotService";

const hitSchema = z.object({
  fundCode: z.string().trim().regex(/^\d{6}$/, "基金代码格式错误"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    // 未登录：只做本地历史，不记录服务端热点
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体无效" }, { status: 400 });
  }

  const parsed = hitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "请求参数无效" }, { status: 400 });
  }

  await recordFundSearchHot(session.user.id, parsed.data.fundCode);
  return NextResponse.json({ ok: true }, { status: 200 });
}

