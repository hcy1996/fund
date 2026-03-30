import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getHoldingStatsByCategoryForUser } from "@/services/statsService";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dim = searchParams.get("dim");

  if (dim !== "account" && dim !== "owner") {
    return NextResponse.json({ error: "dim 必须为 account 或 owner" }, { status: 400 });
  }

  const accountId = searchParams.get("accountId") ?? undefined;
  const ownerName = searchParams.get("ownerName") ?? undefined;

  const data = await getHoldingStatsByCategoryForUser(session.user.id, dim, { accountId, ownerName });

  return NextResponse.json(
    {
      totalValue: data.totalValue,
      groups: data.groups,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

