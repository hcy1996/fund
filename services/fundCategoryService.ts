import { prisma } from "@/lib/prisma";

export type FundCategoryTreeNode = {
  id: string;
  name: string;
  sortOrder: number;
  children: FundCategoryTreeNode[];
};

const SEED_BIG: Array<{ name: string; sortOrder: number }> = [
  { name: "债券", sortOrder: 0 },
  { name: "股基", sortOrder: 1 },
  { name: "大宗", sortOrder: 2 },
];

const SEED_SMALL: Record<string, Array<{ name: string; sortOrder: number }>> = {
  债券: [
    { name: "低波动", sortOrder: 0 },
    { name: "中波动", sortOrder: 1 },
    { name: "高波动", sortOrder: 2 },
  ],
  股基: [
    { name: "全球", sortOrder: 0 },
    { name: "A 股", sortOrder: 1 },
  ],
  大宗: [
    { name: "豆粕", sortOrder: 0 },
    { name: "黄金", sortOrder: 1 },
  ],
};

async function ensureSeeded() {
  const total = await prisma.fundCategory.count();
  if (total > 0) return;

  await prisma.$transaction(async (tx) => {
    const createdBig = await Promise.all(
      SEED_BIG.map((b) =>
        tx.fundCategory.create({
          data: { name: b.name, sortOrder: b.sortOrder, parentId: null },
        }),
      ),
    );

    for (const big of createdBig) {
      const small = SEED_SMALL[big.name] ?? [];
      await Promise.all(
        small.map((s) =>
          tx.fundCategory.create({
            data: { name: s.name, sortOrder: s.sortOrder, parentId: big.id },
          }),
        ),
      );
    }
  });
}

function buildTree(rows: Array<{ id: string; name: string; parentId: string | null; sortOrder: number }>) {
  const byId = new Map<string, { id: string; name: string; sortOrder: number; children: FundCategoryTreeNode[] }>();
  for (const r of rows) {
    byId.set(r.id, { id: r.id, name: r.name, sortOrder: r.sortOrder, children: [] });
  }

  const roots: FundCategoryTreeNode[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (!r.parentId) {
      roots.push(node);
    } else {
      const parent = byId.get(r.parentId);
      if (parent) parent.children.push(node);
    }
  }

  const sortRec = (n: FundCategoryTreeNode) => {
    n.children.sort((a, b) => a.sortOrder - b.sortOrder);
    n.children.forEach(sortRec);
  };
  roots.sort((a, b) => a.sortOrder - b.sortOrder);
  roots.forEach(sortRec);

  return roots;
}

export async function listFundCategoryTree(): Promise<FundCategoryTreeNode[]> {
  await ensureSeeded();
  const rows = await prisma.fundCategory.findMany({
    select: { id: true, name: true, parentId: true, sortOrder: true },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
  });
  return buildTree(rows);
}

export async function createFundCategory(input: { name: string; parentId?: string | null; sortOrder?: number }) {
  await ensureSeeded();
  const parentId = input.parentId ?? null;

  // 校验父节点存在（小类必须有大类）
  if (parentId) {
    const parent = await prisma.fundCategory.findUnique({ where: { id: parentId } });
    if (!parent) return null;
  }

  const row = await prisma.fundCategory.create({
    data: {
      name: input.name.trim(),
      parentId,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  return row;
}

export async function updateFundCategory(id: string, input: { name?: string; sortOrder?: number }) {
  const row = await prisma.fundCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  return row;
}

export async function deleteFundCategory(id: string) {
  const ok = await prisma.fundCategory.findUnique({ where: { id }, select: { id: true } });
  if (!ok) return false;
  await prisma.fundCategory.delete({ where: { id } });
  return true;
}

async function getCategoryWithParent(categoryId: string) {
  const row = await prisma.fundCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, parentId: true },
  });
  if (!row) return null;
  if (!row.parentId) return { id: row.id, name: row.name, parentName: null as string | null };
  const parent = await prisma.fundCategory.findUnique({
    where: { id: row.parentId },
    select: { name: true },
  });
  return { id: row.id, name: row.name, parentName: parent?.name ?? null };
}

export async function getFundCategoryByCode(
  fundCode: string,
): Promise<{ categoryId: string | null; label: string | null }> {
  const code = fundCode.trim();
  if (!code) return { categoryId: null, label: null };

  const fund = await prisma.fund.findUnique({
    where: { code },
    select: { categoryId: true },
  });

  const categoryId = fund?.categoryId ?? null;
  if (!categoryId) return { categoryId: null, label: null };

  const cat = await getCategoryWithParent(categoryId);
  if (!cat) return { categoryId: null, label: null };

  // 约束：基金只能关联“小类”（即必须有 parent）
  if (!cat.parentName) return { categoryId: null, label: null };

  const label = `${cat.parentName}-${cat.name}`;
  return { categoryId, label };
}

export async function setFundCategoryByCode(
  fundCode: string,
  categoryId: string | null,
): Promise<{ categoryId: string | null; label: string | null } | null> {
  const code = fundCode.trim();
  if (!code) return null;

  const fund = await prisma.fund.findUnique({ where: { code }, select: { id: true } });
  if (!fund) return null;

  if (categoryId) {
    const category = await prisma.fundCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, parentId: true },
    });
    // 约束：只能保存小类 id；大类 id 直接拒绝
    if (!category || !category.parentId) return null;
  }

  await prisma.fund.update({
    where: { code },
    data: { categoryId: categoryId ?? null },
  });

  return getFundCategoryByCode(code);
}

