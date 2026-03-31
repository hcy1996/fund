import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { fundCategoryCreateSchema } from "@/lib/validations";
import { createFundCategory, listFundCategoryTree } from "@/services/fundCategoryService";

export const GET = withAuth(async () => {
  const data = await listFundCategoryTree();
  return NextResponse.json({ categories: data });
});

export const POST = withAuth(async (req) => {
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
});
