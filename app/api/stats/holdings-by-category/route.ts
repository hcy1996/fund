import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { getHoldingStatsByCategoryForUser } from "@/services/statsService";

export const GET = withAuth(async (req, _ctx, userId) => {
  const { searchParams } = new URL(req.url);
  const dim = searchParams.get("dim");

  if (dim !== "account" && dim !== "owner") {
    return NextResponse.json({ error: "dim 必须为 account 或 owner" }, { status: 400 });
  }

  const accountId = searchParams.get("accountId") ?? undefined;
  const ownerName = searchParams.get("ownerName") ?? undefined;

  const data = await getHoldingStatsByCategoryForUser(userId, dim, { accountId, ownerName });

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
});
