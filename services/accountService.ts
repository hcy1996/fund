import { prisma } from "@/lib/prisma";

export type AccountDto = {
  id: string;
  name: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_ACCOUNT_NAME = "我的";
const DEFAULT_OWNER_NAME = "我";

async function backfillOwnerFromIsMine(userId: string) {
  // 兼容旧数据：历史上 owner 为空、但有 isMine 标记的账户
  await prisma.account.updateMany({
    where: { userId, owner: null, isMine: true },
    data: { owner: DEFAULT_OWNER_NAME },
  });
  await prisma.account.updateMany({
    where: { userId, owner: null, isMine: false },
    data: { owner: "姐姐" },
  });
}

async function ensureDefaultAccountForUser(userId: string) {
  const existing = await prisma.account.findFirst({
    where: { userId, name: DEFAULT_ACCOUNT_NAME },
  });
  if (existing) return existing;
  const acc = await prisma.account.create({
    data: { userId, name: DEFAULT_ACCOUNT_NAME, owner: DEFAULT_OWNER_NAME },
  });
  // 懒迁移：把该用户历史上未归属账户的持仓挂到「我的」账户下
  await prisma.holding.updateMany({
    where: { userId, accountId: null },
    data: { accountId: acc.id },
  });
  return acc;
}

export async function listAccountsForUser(userId: string): Promise<AccountDto[]> {
  await backfillOwnerFromIsMine(userId);
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
        owner: acc.owner ?? DEFAULT_OWNER_NAME,
        createdAt: acc.createdAt.toISOString(),
        updatedAt: acc.updatedAt.toISOString(),
      },
    ];
  }
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    owner: a.owner ?? DEFAULT_OWNER_NAME,
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

export async function createAccountForUser(
  userId: string,
  name: string,
  owner?: string | null,
): Promise<AccountDto> {
  const trimmed = name.trim();
  const finalName = trimmed || DEFAULT_ACCOUNT_NAME;
  const ownerTrimmed = owner?.trim() || DEFAULT_OWNER_NAME;
  const acc = await prisma.account.create({
    data: { userId, name: finalName, owner: ownerTrimmed },
  });
  return {
    id: acc.id,
    name: acc.name,
    owner: acc.owner ?? DEFAULT_OWNER_NAME,
    createdAt: acc.createdAt.toISOString(),
    updatedAt: acc.updatedAt.toISOString(),
  };
}

export async function updateAccountForUser(
  userId: string,
  accountId: string,
  input: { name?: string; owner?: string | null },
): Promise<AccountDto | null> {
  const acc = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!acc) return null;

  const ownerTrimmed = input.owner === undefined ? undefined : input.owner?.trim() || null;

  const row = await prisma.account.update({
    where: { id: accountId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(ownerTrimmed !== undefined ? { owner: ownerTrimmed ?? DEFAULT_OWNER_NAME } : {}),
    },
  });

  return {
    id: row.id,
    name: row.name,
    owner: row.owner ?? DEFAULT_OWNER_NAME,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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

