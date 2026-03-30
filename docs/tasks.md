# 🧩 tasks.md

## 🚀 阶段 1：项目初始化

### Task 1.1 初始化项目

* 创建 Next.js 项目（App Router + TypeScript）
* 安装 Tailwind CSS
* 配置基础目录结构：

  * app/
  * components/
  * services/
  * providers/
  * lib/
  * types/
  * prisma/

✅ 验证：

* `npm run dev` 可启动
* 首页可访问

---

## 🗄 阶段 2：数据库搭建

### Task 2.1 安装 Prisma

* 安装 prisma 和 client
* 初始化 schema.prisma

---

### Task 2.2 设计数据库模型

实现模型：

* User
* Fund
* Holding
* FundSnapshot

---

### Task 2.3 执行迁移

* 执行 prisma migrate
* 生成数据库表

---

### Task 2.4 seed 数据

* 创建 seed.ts
* 插入测试数据

✅ 验证：

* 能查询到 seed 数据

---

## 🌐 阶段 3：第三方接口（最关键）

### Task 3.1 封装东方财富接口

在 `/providers/fundProvider.ts` 实现：

* 根据基金 code 获取估值
* 获取净值

---

### Task 3.2 统一数据结构

返回统一结构：

```ts
FundQuote
```

---

### Task 3.3 错误处理

* 请求失败 fallback
* 数据为空处理

✅ 验证：

* 输入基金代码能返回数据

---

## 🧠 阶段 4：核心逻辑模块

### Task 4.1 实现交易时间判断

文件：

```id="7c04n4"
lib/tradingTime.ts
```

---

### Task 4.2 实现收益计算模块

文件：

```id="l92wtw"
lib/calculate.ts
```

支持：

* 市值计算
* 收益计算
* 收益率

---

### Task 4.3 精度处理

* 引入 decimal.js
* 替换浮点计算

✅ 验证：

* 输入数据计算结果正确

---

## 🔌 阶段 5：后端 API

### Task 5.1 基金估值接口

GET:

```id="4hpxnf"
/api/funds/quote
```

---

### Task 5.2 持仓接口

实现：

* GET /api/holdings
* POST /api/holdings
* PUT /api/holdings/[id]
* DELETE /api/holdings/[id]

---

### Task 5.3 参数校验

* 使用 zod 校验请求

✅ 验证：

* API 可调用
* 数据能存数据库

---

## 🎨 阶段 6：首页开发

### Task 6.1 搜索模块

* 输入基金代码
* 点击查询

---

### Task 6.2 基金信息展示

展示：

* 基金名称
* 净值
* 估值
* 涨跌

---

### Task 6.3 收益计算 UI

* 输入份额
* 实时显示收益

---

### Task 6.4 加入持仓

* 点击保存到数据库

✅ 验证：

* 页面能查数据
* 能计算收益

---

## 📊 阶段 7：持仓页面

### Task 7.1 持仓列表

展示：

* 基金
* 份额
* 收益

---

### Task 7.2 编辑功能

* 修改份额
* 修改成本

---

### Task 7.3 删除功能

✅ 验证：

* 持仓数据能增删改查

---

## 📄 阶段 8：基金详情页

### Task 8.1 基本信息展示

* 基金信息
* 净值 + 估值

---

### Task 8.2 收益模块复用

---

### Task 8.3 快照展示（可选）

---

## 📱 阶段 9：响应式优化

### Task 9.1 移动端适配

* 卡片布局
* 输入优化

---

### Task 9.2 桌面端优化

* 表格 + 卡片

---

### Task 9.3 状态处理

* loading
* error
* empty

---

## 🧾 阶段 10：收尾

### Task 10.1 README

包含：

* 安装步骤
* 启动方式
* 数据库配置

---

### Task 10.2 环境变量

生成：

```id="07r0hu"
.env.example
```

---

### Task 10.3 最终验证

必须确认：

* 项目能运行
* API 正常
* 数据能保存
* 页面无严重错误
