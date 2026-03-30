# Fund Estimator 身份认证与用户模型设计

> 版本：2026-03-29  
> 目标：在基金估值工具中提供简单可靠的邮箱 + 密码登录，并与持仓数据绑定。

---

## 1. 背景与目标

- 项目整体目标参见 `docs/spec.md`（原始 spec），本设计专注于：
  - 用户身份模型（`User`）
  - 认证方式（登录 / 登出）
  - 与持仓（`Holding`）的关联方式
- 约束：
  - 技术栈：Next.js (App Router) + React + TypeScript + Tailwind + Prisma + MySQL
  - 所有业务逻辑在 `services/`，API 层只做参数解析和调用 service
  - 不做复杂权限系统，只区分“已登录用户 / 未登录用户”

---

## 2. 认证方案选择

### 2.1 候选方案

1. **NextAuth (Auth.js) Credentials 登录**
   - 使用 NextAuth App Router 方案
   - `Credentials` provider 中校验邮箱 + 密码
   - 会话通过 JWT 或数据库方式管理
2. **自建登录 API + JWT + httpOnly Cookie**
   - `/api/auth/login`、`/api/auth/register` 等完全自管
   - 使用 `jose` 之类库签发 JWT，保存在 httpOnly Cookie 中
3. **Lucia + Prisma**
   - 使用 Lucia 之类 session 管理库，统一管理登录、会话、刷新

### 2.2 方案选择

**选用方案 1：NextAuth (Auth.js) + Credentials + bcrypt。**

理由：

- 与 Next.js App Router 集成紧密，文档成熟，易于维护
- 对当前需求（简单邮箱 + 密码登录）足够轻量
- 会话生命周期、Cookie 等安全细节由 NextAuth 处理，减少自实现错误
- 未来如果要接入第三方登录（GitHub、Google 等），扩展简单

---

## 3. 数据模型设计

### 3.1 User 模型

在 `prisma/schema.prisma` 中定义：

- `id`：主键（string 或 int，按 Prisma 默认 `String @id @default(cuid())`）
- `email`：唯一索引，用作登录名
- `passwordHash`：bcrypt 结果，永不存明文
- `deviceId`：可选字段，用于后续匿名 / 多端扩展，目前不强依赖
- `createdAt`：创建时间

示例（不含完整 Prisma 语法，仅说明字段）：

```ts
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  deviceId     String?  @unique
  createdAt    DateTime @default(now())

  holdings     Holding[]
}
```

### 3.2 Holding 模型与用户绑定

持仓表 `Holding` 与 `User` 的关系为：

- 多个持仓属于一个用户
- 所有持仓操作都需要已登录用户上下文，前端不允许显式传 `userId`

约定：

- `Holding.userId` 外键指向 `User.id`
- 查询、创建、更新、删除持仓时，均从 session 中获取当前 `userId`

---

## 4. 认证与会话流程

### 4.1 注册流程

1. 前端在注册表单中提交：
   - `email`
   - `password`
2. 后端 Route Handler：
   - 使用 zod 校验输入
   - 检查 `email` 是否已存在
   - 使用 `bcrypt` 生成 `passwordHash`
   - 创建 `User` 记录
3. 注册完成后：
   - 可以直接返回 201 + 提示前端跳转到登录页
   - 或者在注册后自动登录（初版可不做自动登录，简化流程）

### 4.2 登录流程（NextAuth Credentials）

1. 在 `app/api/auth/[...nextauth]/route.ts` 中配置 NextAuth：
   - 使用 `CredentialsProvider`
   - 在 `authorize` 回调中：
     - 根据 email 查找用户
     - 使用 `bcrypt.compare` 校验密码
     - 成功则返回精简的 user 对象（含 `id`、`email`）
2. Session 选择：
   - 使用 NextAuth 默认的 JWT session 即可
3. 在前端：
   - 使用 `next-auth/react` 的 `signIn` 函数进行登录
   - 登录成功后可跳转到首页或持仓页

### 4.3 会话获取与保护

- 在后端 API（如 `/api/holdings`）中：
  - 使用 `getServerSession` 获取当前用户 session
  - 如果无 session，则返回 401
  - 有 session 时，从 `session.user.id` 中读取 `userId`
- 在需要登录的页面（如持仓列表页面）：
  - 使用 Server Component + `getServerSession` 判断
  - 如未登录，可重定向到登录页或展示登录提示

---

## 5. 与业务模块的关系

### 5.1 持仓（Holdings）模块

- 所有持仓接口均依赖当前已登录用户：
  - `GET /api/holdings`：返回当前用户的所有持仓
  - `POST /api/holdings`：为当前用户新增持仓
  - `PUT /api/holdings/[id]`：更新当前用户某条持仓（需验证归属）
  - `DELETE /api/holdings/[id]`：删除当前用户某条持仓（需验证归属）
- 在 `services/holdingService.ts` 中：
  - 所有函数都接收 `userId` 作为必选参数
  - Service 内部使用 Prisma 基于 `userId` 做查询/修改

### 5.2 基金估值（Fund / FundQuote）模块

- 估值查询接口不需要登录即可访问（只读数据）
- 用户输入份额、保存为持仓时才需要登录
- 估值接口与认证模块之间无直接依赖，只在“保存到持仓”操作时通过 API 结合

---

## 6. 环境变量与配置

在 `.env` / `.env.example` 中增加：

- `DATABASE_URL`：MySQL 连接字符串（Prisma 使用）
- `NEXTAUTH_SECRET`：NextAuth 加密与签名密钥（必填）
- `NEXTAUTH_URL`：应用基础 URL，如 `http://localhost:3000`

在 `next.config` 中无需为认证做额外配置，只需保证 App Router 生效。

---

## 7. 初版范围与不做的内容

初版**刻意不做**：

- 不做密码找回 / 重置
- 不做邮箱验证
- 不做刷新 Token / 多设备登出等复杂会话管理
- 不做角色权限（admin / user 等）

后续如需扩展，可以在：

- `User` 模型中增加 `role`、`emailVerifiedAt` 等字段
- 在 NextAuth 配置中增加更多 Provider 或自定义回调

---

## 8. 验收标准（认证相关）

- 可以通过注册接口创建新用户
- 可以使用邮箱 + 密码登录
- 登录成功后：
  - 可以访问 `/api/holdings` 并看到自己的持仓
  - 新增 / 编辑 / 删除持仓只影响当前登录用户的数据
- 未登录访问需要登录的 API / 页面时，会得到合理的 401 / 跳转提示

