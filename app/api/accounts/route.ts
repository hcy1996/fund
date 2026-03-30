import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listAccountsForUser, createAccountForUser } from "@/services/accountService";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const accounts = await listAccountsForUser(session.user.id);
  return NextResponse.json(accounts);
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
  const name =
    body &&
    typeof body === "object" &&
    "name" in body &&
    typeof (body as { name?: unknown }).name === "string"
      ? (body as { name: string }).name
      : "";
  const acc = await createAccountForUser(session.user.id, name);
  return NextResponse.json(acc, { status: 201 });
}

