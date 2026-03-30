# Fund Estimator（基金估值）

基于 Next.js App Router + Prisma（MySQL）+ Tailwind 的基金净值/估值查询与持仓管理应用。第三方行情经后端代理东方财富接口，前端不直连。

## 环境要求

- Node.js 20+
- Yarn 1.x
- MySQL 8（本地或远程）

## 安装

```bash
yarn install
```

## 数据库

1. 在 MySQL 中创建数据库，例如 `fund_estimator`。
2. 复制环境变量并填写连接串：

```bash
cp .env.example .env
# 编辑 .env 中的 DATABASE_URL
```

或使用项目内 Docker（需本机已安装并启动 Docker）：

```bash
docker compose up -d
# 默认映射端口 3307，与 .env.example 中示例一致
```

3. 应用迁移并生成 Client：

```bash
npx prisma migrate deploy
yarn prisma:generate
```

4.（可选）写入示例数据：

```bash
yarn db:seed
```

示例账号（来自 seed）：

- 邮箱：`demo@example.com`
- 密码：`password123`

## 开发

```bash
yarn dev
```

浏览器打开 <http://localhost:3000>。

## 环境变量说明

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | MySQL 连接串，如 `mysql://user:pass@host:3306/fund_estimator` |
| `NEXTAUTH_SECRET` | NextAuth 密钥，生产环境务必更换 |
| `NEXTAUTH_URL` | 站点根 URL，本地一般为 `http://localhost:3000` |

## 主要接口（HTTP）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/funds/quote?code=` | 基金行情（净值/估值等） |
| GET/POST | `/api/holdings` | 列表 / 新增持仓（需登录） |
| PUT/DELETE | `/api/holdings/[id]` | 更新 / 删除持仓（需登录） |
| POST | `/api/auth/register` | 注册 `{ email, password }` |
| GET/POST | `/api/auth/*` | NextAuth 会话与登录 |

## 项目结构（节选）

- `app/`：页面与 Route Handlers
- `components/`：UI 组件
- `services/`：业务逻辑
- `providers/`：第三方接口封装（东方财富）
- `lib/`：工具（交易时间、收益计算、Prisma 单例）
- `prisma/`：Schema 与迁移

## 构建

```bash
yarn build
yarn start
```
