import { prisma } from "@/lib/prisma";

export type AccountDto = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_ACCOUNT_NAME = "我的";

async function ensureDefaultAccountForUser(userId: string) {
  const existing = await prisma.account.findFirst({
    where: { userId, name: DEFAULT_ACCOUNT_NAME },
  });
  if (existing) return existing;
  const acc = await prisma.account.create({
    data: { userId, name: DEFAULT_ACCOUNT_NAME },
  });
  // 懒迁移：把该用户历史上未归属账户的持仓挂到「我的」账户下
  await prisma.holding.updateMany({
    where: { userId, accountId: null },
    data: { accountId: acc.id },
  });
  return acc;
}

export async function listAccountsForUser(userId: string): Promise<AccountDto[]> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (accounts.length === 0) {
    const acc = await ensureDefaultAccountForUser(userId);
    return [
      {
        id: acc.id,
        name: acc.name,
        createdAt: acc.createdAt.toISOString(),
        updatedAt: acc.updatedAt.toISOString(),
      },
    ];
  }
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));
}

export async function resolveAccountIdForUser(
  userId: string,
  preferredAccountId?: string | null,
): Promise<string | null> {
  const accounts = await listAccountsForUser(userId);
  if (!accounts.length) return null;
  if (preferredAccountId && accounts.some((a) => a.id === preferredAccountId)) {
    return preferredAccountId;
  }
  return accounts[0]!.id;
}

export async function createAccountForUser(userId: string, name: string): Promise<AccountDto> {
  const trimmed = name.trim();
  const finalName = trimmed || DEFAULT_ACCOUNT_NAME;
  const acc = await prisma.account.create({
    data: { userId, name: finalName },
  });
  return {
    id: acc.id,
    name: acc.name,
    createdAt: acc.createdAt.toISOString(),
    updatedAt: acc.updatedAt.toISOString(),
  };
}

export async function deleteAccountForUser(userId: string, accountId: string): Promise<boolean> {
  const acc = await prisma.account.findFirst({
    where: { id: accountId, userId },
  });
  if (!acc) return false;

  const holdingCount = await prisma.holding.count({
    where: { userId, accountId },
  });
  if (holdingCount > 0) {
    throw new Error("该账户下仍有持仓，请先清空持仓再删除账户");
  }

  await prisma.account.delete({ where: { id: acc.id } });
  return true;
}

