import { NextResponse } from "next/server";
import { getFundCategoryByCode, setFundCategoryByCode } from "@/services/fundCategoryService";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code?.trim()) {
    return NextResponse.json({ error: "缺少参数 code" }, { status: 400 });
  }

  const res = await getFundCategoryByCode(code);
  return NextResponse.json(res, {
    headers: {
      "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
    },
  });
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { code?: string; categoryId?: string | null };
    const code = body.code?.trim();
    if (!code) {
      return NextResponse.json({ error: "缺少参数 code" }, { status: 400 });
    }

    const categoryId = body.categoryId ?? null;

    const res = await setFundCategoryByCode(code, categoryId);
    if (!res) {
      return NextResponse.json({ error: "保存失败（分类必须为小类）" }, { status: 400 });
    }
    return NextResponse.json(res);
  } catch {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }
}

