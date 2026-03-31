import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function safeLogDbTarget() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return;
  try {
    const u = new URL(raw);
    const host = u.host;
    const user = u.username ? `${u.username}` : "unknown";
    const db = u.pathname ? u.pathname.replace(/^\//, "") : "";
    const userMasked = user.length <= 2 ? "**" : `${user.slice(0, 2)}***`;
    // 避免泄露密码：只打印 user/host/db（user 也做了简单打码）
    // eslint-disable-next-line no-console
    console.log(`[prisma] connect db: ${userMasked}@${host}/${db || "unknown"}`);
  } catch {
    // eslint-disable-next-line no-console
    console.log(`[prisma] connect db: (unparsed DATABASE_URL)`);
  }
}

safeLogDbTarget();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // 默认只在控制台输出错误日志，避免刷屏
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
