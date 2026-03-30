import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);
  const user = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      email: "demo@example.com",
      passwordHash,
    },
  });

  const fund = await prisma.fund.upsert({
    where: { code: "000001" },
    update: {},
    create: {
      code: "000001",
      name: "华夏成长混合",
    },
  });

  await prisma.holding.deleteMany({
    where: { userId: user.id, fundId: fund.id },
  });

  await prisma.holding.create({
    data: {
      userId: user.id,
      fundId: fund.id,
      shares: 1000,
      costPrice: 1.0,
    },
  });

  const group = await prisma.watchlistGroup.upsert({
    where: {
      userId_name: {
        userId: user.id,
        name: "全部",
      },
    },
    update: {},
    create: {
      userId: user.id,
      name: "全部",
      sortOrder: 0,
    },
  });

  const item = await prisma.watchlistItem.upsert({
    where: {
      userId_fundCode: {
        userId: user.id,
        fundCode: fund.code,
      },
    },
    update: { fundName: fund.name },
    create: {
      userId: user.id,
      fundCode: fund.code,
      fundName: fund.name,
    },
  });

  await prisma.watchlistItemGroup.upsert({
    where: {
      groupId_itemId: {
        groupId: group.id,
        itemId: item.id,
      },
    },
    update: {},
    create: {
      groupId: group.id,
      itemId: item.id,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
