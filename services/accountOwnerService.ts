import { prisma } from "@/lib/prisma";

export type AccountOwnerDto = {
  id: string;
  name: string;
  sortOrder: number;
};

async function ensureSeedAccountOwners(userId: string) {
  // 兼容旧数据：owner 为空但存在 isMine 的账户，先回填 owner，
  // 后续统计/维护只使用 owner。
  await prisma.account.updateMany({
    where: { userId, owner: null, isMine: true },
    data: { owner: "我" },
  });
  await prisma.account.updateMany({
    where: { userId, owner: null, isMine: false },
    data: { owner: "姐姐" },
  });

  const count = await prisma.accountOwner.count({ where: { userId } });
  if (count > 0) return;

  // 从现有账户里推断 owner 候选
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { owner: true },
  });

  const names = new Set<string>();
  for (const a of accounts) {
    if (typeof a.owner === "string" && a.owner.trim()) {
      names.add(a.owner.trim());
    }
  }

  // 基于“我/姐姐”优先，再放其他
  const preferred = ["我", "姐姐"];
  const ordered = [
    ...preferred.filter((n) => names.has(n)),
    ...[...names].filter((n) => !preferred.includes(n)).sort((a, b) => a.localeCompare(b)),
  ];

  const finalOrdered = ordered.length > 0 ? ordered : ["我", "姐姐"];

  await prisma.$transaction(
    finalOrdered.map((name, idx) =>
      prisma.accountOwner.create({
        data: { userId, name, sortOrder: idx },
      }),
    ),
  );
}

function accountCountWhereOwnerName(userId: string, ownerName: string) {
  return prisma.account.count({ where: { userId, owner: ownerName } });
}

export async function listAccountOwners(userId: string): Promise<AccountOwnerDto[]> {
  await ensureSeedAccountOwners(userId);
  const rows = await prisma.accountOwner.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, sortOrder: true },
  });
  return rows;
}

export async function createAccountOwner(userId: string, input: { name: string; sortOrder?: number }) {
  await ensureSeedAccountOwners(userId);
  const name = input.name.trim();
  const exists = await prisma.accountOwner.findUnique({ where: { userId_name: { userId, name } } });
  if (exists) return null;

  const row = await prisma.accountOwner.create({
    data: { userId, name, sortOrder: input.sortOrder ?? 0 },
  });
  return row;
}

export async function updateAccountOwner(
  userId: string,
  id: string,
  input: { name?: string; sortOrder?: number },
) {
  const row = await prisma.accountOwner.findFirst({ where: { id, userId } });
  if (!row) return null;

  const nextName = input.name !== undefined ? input.name.trim() : undefined;
  const nextSortOrder = input.sortOrder !== undefined ? input.sortOrder : undefined;

  if (nextName && nextName !== row.name) {
    await prisma.account.updateMany({
      where: { userId, owner: row.name },
      data: {
        owner: nextName,
      },
    });
  }

  const updated = await prisma.accountOwner.update({
    where: { id },
    data: {
      ...(nextName !== undefined ? { name: nextName } : {}),
      ...(nextSortOrder !== undefined ? { sortOrder: nextSortOrder } : {}),
    },
  });
  return updated;
}

export async function deleteAccountOwner(userId: string, id: string) {
  const row = await prisma.accountOwner.findFirst({ where: { id, userId } });
  if (!row) return false;

  const usedCount = await accountCountWhereOwnerName(userId, row.name);
  if (usedCount > 0) {
    throw new Error("该归属人名仍被账户使用，请先为相关账户取消/调整后再删除");
  }

  await prisma.accountOwner.delete({ where: { id } });
  return true;
}

