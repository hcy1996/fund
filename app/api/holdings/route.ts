import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listHoldingsForUser, listHoldingsForUserByAccountIds, createHolding } from "@/services/holdingService";
import { holdingCreateSchema } from "@/lib/validations";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId") || undefined;
  const ownerName = searchParams.get("ownerName") || undefined;
  const debug = searchParams.get("debug") === "1";

  const t0 = Date.now();
  let accountsQueryMs: number | undefined = undefined;

  const dataResult = ownerName
    ? await (async () => {
        const tAccounts0 = Date.now();
        const accounts = await prisma.account.findMany({
          where: { userId: session.user.id, owner: ownerName },
          select: { id: true },
        });
        const ids = accounts.map((a) => a.id);
        const r = await listHoldingsForUserByAccountIds(session.user.id, ids, { debug });
        accountsQueryMs = Date.now() - tAccounts0;
        return r;
      })()
    : await (async () => {
        const r = await listHoldingsForUser(session.user.id, accountId, { debug });
        return r;
      })();

  if (debug) {
    return NextResponse.json({
      data: dataResult.data,
      debug: {
        totalMs: Date.now() - t0,
        accountsQueryMs,
        ...(dataResult as any).debugTimings,
      },
    });
  }

  return NextResponse.json(dataResult.data);
}

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
  const parsed = holdingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  try {
    const row = await createHolding(session.user.id, parsed.data);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
