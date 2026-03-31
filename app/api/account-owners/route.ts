import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { accountOwnerCreateSchema } from "@/lib/validations";
import { createAccountOwner, listAccountOwners } from "@/services/accountOwnerService";

export const GET = withAuth(async (_req, _ctx, userId) => {
  const data = await listAccountOwners(userId);
  return NextResponse.json({ owners: data });
});

export const POST = withAuth(async (req, _ctx, userId) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const parsed = accountOwnerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const row = await createAccountOwner(userId, { name: parsed.data.name, sortOrder: parsed.data.sortOrder });
  if (!row) return NextResponse.json({ error: "名称已存在" }, { status: 409 });
  return NextResponse.json(row, { status: 201 });
});
