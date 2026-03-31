import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fundCategoryCreateSchema } from "@/lib/validations";
import { createFundCategory, listFundCategoryTree } from "@/services/fundCategoryService";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const data = await listFundCategoryTree();
  return NextResponse.json({ categories: data });
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

  const parsed = fundCategoryCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const row = await createFundCategory({
    name: parsed.data.name,
    parentId: parsed.data.parentId ?? null,
    sortOrder: parsed.data.sortOrder,
  });

  if (!row) {
    return NextResponse.json({ error: "父类不存在" }, { status: 400 });
  }

  return NextResponse.json(row, { status: 201 });
}
