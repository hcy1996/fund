import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { createAccountForUser, listAccountsForUser } from "@/services/accountService";

export const GET = withAuth(async (_req, _ctx, userId) => {
  const accounts = await listAccountsForUser(userId);
  return NextResponse.json(accounts);
});

export const POST = withAuth(async (req, _ctx, userId) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const name =
    body &&
    typeof body === "object" &&
    "name" in body &&
    typeof (body as { name?: unknown }).name === "string"
      ? (body as { name: string }).name
      : "";
  const owner =
    body &&
    typeof body === "object" &&
    "owner" in body &&
    typeof (body as { owner?: unknown }).owner === "string"
      ? ((body as { owner: string }).owner as string)
      : null;

  const acc = await createAccountForUser(userId, name, owner);
  return NextResponse.json(acc, { status: 201 });
});
