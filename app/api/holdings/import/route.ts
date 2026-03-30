import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { holdingsImportBodySchema } from "@/lib/validations";
import { importHoldingsBatch } from "@/services/holdingService";

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

  const parsed = holdingsImportBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { items, syncWatchlist, accountId } = parsed.data;
  const result = await importHoldingsBatch(session.user.id, items, { syncWatchlist, accountId });
  return NextResponse.json(result);
}
