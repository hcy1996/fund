import { NextResponse } from "next/server";
import { auth } from "@/auth";

export function withAuth<TCtx = unknown>(
  handler: (req: Request, ctx: TCtx, userId: string) => Promise<Response>,
) {
  return async (req: Request, ctx: TCtx): Promise<Response> => {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return handler(req, ctx, userId);
  };
}
