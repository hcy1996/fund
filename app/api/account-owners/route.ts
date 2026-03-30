import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { accountOwnerCreateSchema } from "@/lib/validations";
import { createAccountOwner, listAccountOwners } from "@/services/accountOwnerService";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const data = await listAccountOwners(session.user.id);
  return NextResponse.json({ owners: data });
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

  const parsed = accountOwnerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const row = await createAccountOwner(session.user.id, { name: parsed.data.name, sortOrder: parsed.data.sortOrder });
  if (!row) return NextResponse.json({ error: "名称已存在" }, { status: 409 });
  return NextResponse.json(row, { status: 201 });
}

