# Fund Estimator 初始化与数据库实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用 Next.js (App Router) + TypeScript + Tailwind + Prisma + MySQL，完成项目脚手架、数据库 schema 与基础迁移，为后续功能开发打好基础。

**Architecture:** 根目录为 Next.js 应用根，使用 App Router；数据库使用 Prisma 连接外部 MySQL；目录结构遵守 `/app`、`/components`、`/services`、`/providers`、`/lib`、`/types`、`/prisma` 规范。

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Prisma, MySQL, Yarn, Jest/Testing Library（预留给后续 TDD）。

---

## Task 1：使用 yarn 初始化 Next.js 项目（App Router + TS + Tailwind）

**Files:**
- 创建：`package.json`
- 创建：`next.config.mjs`（或默认生成的配置）
- 创建：`tsconfig.json`
- 创建：`app/layout.tsx`, `app/page.tsx`
- 创建：`styles/globals.css`（Tailwind 入口）

- [ ] **Step 1: 使用 yarn create next-app 初始化项目**

在项目根目录 `/Users/huangchenyao/Desktop/fund` 运行：

```bash
yarn create next-app . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --yes
```

期望结果：

- 命令执行成功，无报错
- 目录下出现 `app/`, `public/`, `styles/`, `next.config.*`, `package.json` 等文件

- [ ] **Step 2: 验证开发服务器可以启动**

```bash
yarn dev
```

期望结果：

- 终端显示 Next.js 启动成功日志
- 访问 `http://localhost:3000` 能看到默认首页

---

## Task 2：调整目录结构与基础布局

**Files:**
- 修改：`app/layout.tsx`
- 修改：`app/page.tsx`
- 确认存在目录：`components/`, `services/`, `providers/`, `lib/`, `types/`, `prisma/`

- [ ] **Step 1: 创建标准目录结构**

在项目根目录执行：

```bash
mkdir -p components services providers lib types prisma
```

期望结果：

- 根目录存在上述六个空目录，供后续开发使用

- [ ] **Step 2: 简化默认布局，确认项目可运行**

编辑 `app/layout.tsx`，确保结构类似：

```tsx
export const metadata = {
  title: 'Fund Estimator',
  description: '基金估值工具',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-950 text-slate-50">
        {children}
      </body>
    </html>
  );
}
```

编辑 `app/page.tsx` 为一个简单占位首页，例如：

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Fund Estimator</h1>
        <p className="text-sm text-slate-400">项目初始化成功，后续按 tasks.md 开发功能。</p>
      </div>
    </main>
  );
}
```

运行：

```bash
yarn dev
```

期望结果：

- 首页渲染为上述简单 UI，无报错

---

## Task 3：安装与初始化 Prisma

**Files:**
- 创建：`prisma/schema.prisma`
- 修改：`package.json`（添加 Prisma 脚本）

- [ ] **Step 1: 安装 Prisma 依赖**

在项目根目录执行：

```bash
yarn add -D prisma
yarn add @prisma/client
```

期望结果：

- `package.json` 的 `devDependencies` 中有 `prisma`
- `dependencies` 中有 `@prisma/client`

- [ ] **Step 2: 初始化 Prisma schema**

执行：

```bash
npx prisma init
```

期望结果：

- 根目录出现 `prisma/` 目录和 `prisma/schema.prisma`
- 根目录 `.env` 文件中出现 `DATABASE_URL` 占位（后续会改为真实 MySQL 地址）

- [ ] **Step 3: 在 package.json 中添加 Prisma 脚本**

在 `package.json` 中增加（如不存在）：

```json
{
  "scripts": {
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "prisma:studio": "prisma studio"
  }
}
```

期望结果：

- 可以运行 `yarn prisma:generate`、`yarn prisma:migrate` 等命令

---

## Task 4：设计并实现数据库模型（User / Fund / Holding / FundSnapshot）

**Files:**
- 修改：`prisma/schema.prisma`

- [ ] **Step 1: 定义 User 模型**

在 `prisma/schema.prisma` 中添加：

```prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  deviceId     String?   @unique
  createdAt    DateTime  @default(now())

  holdings     Holding[]
}
```

- [ ] **Step 2: 定义 Fund 模型**

```prisma
model Fund {
  id        String    @id @default(cuid())
  code      String    @unique
  name      String
  createdAt DateTime  @default(now())

  holdings  Holding[]
}
```

- [ ] **Step 3: 定义 Holding 模型**

```prisma
model Holding {
  id         String    @id @default(cuid())
  userId     String
  fundId     String
  shares     Decimal   @db.Decimal(20, 4)
  costPrice  Decimal   @db.Decimal(20, 4)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  user       User      @relation(fields: [userId], references: [id])
  fund       Fund      @relation(fields: [fundId], references: [id])
}
```

- [ ] **Step 4: 定义 FundSnapshot 模型**

```prisma
model FundSnapshot {
  id                String   @id @default(cuid())
  fundCode          String
  nav               Decimal? @db.Decimal(20, 4)
  estimateNav       Decimal? @db.Decimal(20, 4)
  estimateRate      Decimal? @db.Decimal(10, 4)
  timestamp         DateTime @default(now())
}
```

- [ ] **Step 5: 配置 Decimal 类型兼容 MySQL**

确保在 `schema.prisma` 顶部 datasource 使用 MySQL：

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

期望结果：

- `prisma format` 不报错

---

## Task 5：执行数据库迁移

**Files:**
- 使用：`prisma/schema.prisma`
- 生成：`prisma/migrations/*`

- [ ] **Step 1: 配置 .env 中的 DATABASE_URL**

编辑 `.env`，填入你的 MySQL 连接字符串，例如：

```env
DATABASE_URL="mysql://username:password@localhost:3306/fund_estimator"
```

期望结果：

- 能通过 MySQL 客户端连接到该数据库

- [ ] **Step 2: 运行 Prisma 迁移**

执行：

```bash
yarn prisma:migrate dev --name init
```

期望结果：

- 命令执行成功
- 数据库中生成 `User`、`Fund`、`Holding`、`FundSnapshot` 等表

- [ ] **Step 3: 生成 Prisma Client**

执行：

```bash
yarn prisma:generate
```

期望结果：

- 生成 `.prisma/client`
- 之后在 `services/` 中可以通过 `import { PrismaClient } from '@prisma/client'` 使用

---

## Task 6：Seed 测试数据

**Files:**
- 创建：`prisma/seed.ts`
- 修改：`package.json`（添加 `prisma:seed` 脚本）

- [ ] **Step 1: 编写 seed 脚本**

在 `prisma/seed.ts` 中编写简单的种子数据逻辑，例如：

```ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      passwordHash,
    },
  });

  const fund = await prisma.fund.upsert({
    where: { code: '000001' },
    update: {},
    create: {
      code: '000001',
      name: '示例基金',
    },
  });

  await prisma.holding.create({
    data: {
      userId: user.id,
      fundId: fund.id,
      shares: 1000,
      costPrice: 1.0000,
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
```

- [ ] **Step 2: 配置 package.json 中的 seed 命令**

在 `package.json` 的 `prisma` 配置中增加：

```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

并确保安装了所需依赖：

```bash
yarn add -D ts-node typescript
yarn add bcryptjs
```

- [ ] **Step 3: 运行 seed 并验证**

执行：

```bash
npx prisma db seed
```

期望结果：

- 命令执行成功，无错误
- 数据库中存在：
  - 用户 `demo@example.com`
  - 基金 `000001`
  - 至少一条持仓记录

---

## 最终验证（对应 tasks.md 阶段 1 & 2）

- [ ] `yarn dev` 可以正常启动应用，首页无报错
- [ ] `yarn prisma:migrate dev` 成功执行
- [ ] `npx prisma db seed` 成功执行
- [ ] 通过数据库客户端可以看到 seed 插入的测试数据

