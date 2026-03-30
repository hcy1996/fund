# 📊 基金估值应用开发文档（spec.md）

---

# 一、项目概述

## 1.1 项目名称

基金估值工具（Fund Estimator）

## 1.2 项目目标

开发一个支持 Web + H5 的基金估值工具，用户可以：

* 查询基金实时估值（盘中）
* 查看基金净值（官方）
* 输入持有份额
* 自动计算收益
* 保存持仓数据

---

# 二、核心能力

## 2.1 数据能力

系统需要获取并展示：

| 类型   | 说明          |
| ---- | ----------- |
| 基金估值 | 盘中估算值（实时变化） |
| 基金净值 | 官方每日结算值     |
| 涨跌幅  | 相比上一日变化     |
| 更新时间 | 数据时间        |

数据来源：

* 东方财富接口（后端代理）

---

## 2.2 用户能力

用户可以：

* 输入基金代码查询
* 输入持有份额
* 查看当前收益
* 保存持仓
* 查看持仓列表

---

# 三、功能设计

---

## 3.1 基金查询

### 输入

* 基金代码（字符串）

### 输出

```ts
{
  fundCode: string;
  fundName: string;
  nav: number;              // 净值
  navDate: string;
  estimateNav: number;      // 估值
  estimateChangeRate: number;
  estimateTime: string;
  isTradingTime: boolean;
}
```

---

## 3.2 开市时间判断

规则：

* 周一至周五
* 9:30–11:30
* 13:00–15:00

非开市状态：

* 提示：估值非实时
* 仍显示最近数据

---

## 3.3 收益计算

### 输入

```ts
{
  shares: number;
  estimateNav?: number;
  nav?: number;
  costPrice?: number;
}
```

### 输出

```ts
{
  estimateValue: number;
  navValue: number;
  dailyProfit: number;
  dailyProfitRate: number;
  totalProfit?: number;
  totalProfitRate?: number;
}
```

---

## 3.4 持仓管理

支持：

* 添加持仓
* 修改份额
* 删除持仓
* 列表展示

---

# 四、页面设计

---

## 4.1 首页（核心页面）

包含：

* 基金搜索输入框
* 基金信息卡片
* 收益计算区域
* 加入持仓按钮

---

## 4.2 持仓页

展示：

* 基金列表
* 份额
* 当前市值
* 收益情况

操作：

* 编辑份额
* 删除持仓

---

## 4.3 基金详情页

展示：

* 基金基础信息
* 估值 + 净值
* 更新时间
* 收益计算模块

---

# 五、技术架构

---

## 5.1 技术栈

### 前端

* Next.js (App Router)
* React + TypeScript
* Tailwind CSS

### 后端

* Next.js Route Handlers

### 数据库

* MySQL
* Prisma

---

## 5.2 分层结构

```txt
app/
  api/
components/
services/
providers/
lib/
types/
prisma/
```

---

## 5.3 职责划分

| 层          | 作用          |
| ---------- | ----------- |
| providers  | 第三方接口（东方财富） |
| services   | 业务逻辑        |
| api        | HTTP 接口     |
| lib        | 工具函数        |
| components | UI          |

---

# 六、接口设计

---

## 6.1 获取基金估值

GET /api/funds/quote?code=xxx

---

## 6.2 获取持仓

GET /api/holdings

---

## 6.3 新增持仓

POST /api/holdings

---

## 6.4 更新持仓

PUT /api/holdings/:id

---

## 6.5 删除持仓

DELETE /api/holdings/:id

---

# 七、数据库设计

---

## 7.1 User

```ts
id
deviceId
createdAt
```

---

## 7.2 Fund

```ts
id
code
name
createdAt
```

---

## 7.3 Holding

```ts
id
userId
fundId
shares
costPrice
createdAt
updatedAt
```

---

## 7.4 FundSnapshot

```ts
id
fundCode
nav
estimateNav
estimateRate
timestamp
```

---

# 八、第三方接口设计

---

## 8.1 东方财富接口

用途：

* 获取基金估值
* 获取净值

要求：

* 后端代理
* 封装在 providers
* 做字段统一转换

---

## 8.2 数据统一结构

```ts
type FundQuote = {
  fundCode: string;
  fundName: string;
  nav?: number;
  estimateNav?: number;
  estimateChangeRate?: number;
  estimateTime?: string;
  isTradingTime: boolean;
};
```

---

# 九、关键模块设计

---

## 9.1 收益计算模块

位置：

```
lib/calculate.ts
```

要求：

* 独立函数
* 使用 decimal.js
* 处理精度问题

---

## 9.2 开市判断模块

位置：

```
lib/tradingTime.ts
```

---

# 十、非功能需求

---

## 10.1 性能

* 接口响应 < 500ms
* 页面首屏 < 2s

---

## 10.2 兼容性

* 支持移动端
* 支持桌面浏览器

---

## 10.3 可扩展性

预留：

* 用户登录
* 多账户
* 基金历史走势
* 多市场支持

---

# 十一、约束与风险

---

## 11.1 东方财富接口

可能存在：

* 不稳定
* 字段变化
* 反爬限制

解决：

* 后端代理
* 容错处理
* fallback 数据

---

## 11.2 精度问题

必须避免：

* 浮点误差

方案：

* decimal.js

---

# 十二、验收标准

---

必须满足：

* 可以查询基金
* 可以获取估值
* 可以计算收益
* 可以保存持仓
* 刷新后数据存在
* 移动端可用
* 无严重报错

---

# 十三、运行说明（AI 需要输出）

必须包含：

* npm install
* prisma migrate
* npm run dev
* 环境变量说明

---

# 🎯 总结

这是一个：

* 有前后端
* 有数据库
* 有第三方接口
* 有计算逻辑
* 可运行的完整应用
