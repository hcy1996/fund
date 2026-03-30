# 首页「统计」Tab（按账户/归属人）设计说明

日期：2026-03-30

## 背景与目标

在首页现有 Tab（`首页 / 自选 / 行情`）基础上，在左侧新增一个 `统计` Tab，用于生成类似截图的持仓统计表。

统计需要支持两种维度：

- **按账户**：选择 1 个账户，对该账户持仓进行统计。
- **按归属人**：选择 1 个归属人（`Account.owner`），合并该归属人名下所有账户的持仓后统计。

核心产出是一个按 **大类/小类** 分组的表格，包含基金明细、**小类小计**、**大类小计**、**总计**。

## 统计口径

- **金额口径**：使用“净值口径市值”，与现有持仓列表中 `HoldingWithProfit.profit.navValue` 的口径保持一致。
  - 依赖 `getFundQuote` 中的“最后正式净值（officialNav）优先，否则回退 nav/estimateNav）”的策略（与 `services/holdingService.ts` 现有逻辑一致）。
- **占比**：\(占比 = 金额 / 总金额\)

### 合并规则

- **按账户**：仅统计该账户下的 `Holding`。
- **按归属人**：
  - 先找到该归属人名下的全部 `Account.id`。
  - 查询这些账户下的 `Holding`。
  - 同一基金（同 `fundCode`）跨账户出现时，先按 `fundCode` 汇总 `shares`，再用统一净值计算金额，避免明细重复。

## 分类约束与未分类处理

- 基金分类来自 `Fund.categoryId -> FundCategory`，且基金只允许关联“小类”（`FundCategory.parentId != null`）。
- 若某基金 `categoryId` 为空或不合法，统一归类到：
  - 大类：`未分类`
  - 小类：`未设置小类`
  - 该分组排序置底

## UI/交互设计（统计 Tab）

### Tab

在 `components/home/fund-home.tsx` 的 Tab 条中新增 `统计`：

- `activeTab` 扩展为 `"home" | "watchlist" | "market" | "stats"`
- 本地存储键复用 `fund-home:activeTab`

### 筛选区

进入 `统计` Tab 后显示：

- **维度切换**：`账户 / 归属人`
- **抽屉选择器**：
  - 维度=账户：展示账户列表（来自 `/api/accounts`）
  - 维度=归属人：展示归属人列表（来自 `/api/account-owners`）
- 选择变化后自动触发重新加载统计（无需额外按钮）

### 表格

表头列（与截图风格接近）：

- 大类 | 小类 | 代码 | 基金名称 | 占比 | 持有金额 | 求和

行类型：

1. **基金明细行**
   - 显示：大类、小类、代码、名称、占比、持有金额
   - `求和`列为空
2. **小类小计行**
   - 显示：小类、占比（小类/总计）、`求和=小类金额`
   - 其它列留空或弱化
3. **大类小计行**
   - 显示：大类、占比（大类/总计）、`求和=大类金额`
4. **总计行**
   - `求和=总金额`，占比=100%

排序规则：

- 大类按 `FundCategory.sortOrder`（未分类置底）
- 小类按 `sortOrder`（未设置小类置底）
- 基金明细按持有金额降序

## API 设计

新增聚合接口（服务端负责聚合与小计计算）：

`GET /api/stats/holdings-by-category`

Query 参数：

- `dim`: `"account" | "owner"`（必填）
- `accountId`: string（dim=account 必填）
- `ownerName`: string（dim=owner 必填，使用 `Account.owner` 的名称）

返回示例：

```json
{
  "asOf": "2026-03-30T12:34:56.000Z",
  "totalValue": 576000,
  "groups": [
    {
      "big": { "id": "债券", "name": "债券", "value": 316000, "pct": 0.5486 },
      "smalls": [
        {
          "small": { "id": "低波动", "name": "低波动", "value": 316000, "pct": 0.5486 },
          "funds": [
            { "code": "016482", "name": "兴全恒信债券C", "value": 100000, "pct": 0.1736 }
          ]
        }
      ]
    }
  ]
}
```

其中：

- `value` 为净值口径市值
- `pct` 为相对 `totalValue` 的占比

### 权限

沿用现有 API 权限方式：

- 必须登录（`auth()`），否则返回 401
- 所有查询都限定在当前用户 `userId`

## 服务端实现建议（聚合流程）

1. 解析参数并校验必填
2. 根据 `dim` 定位目标 `Holding` 集合：
   - account：`where { userId, accountId }`
   - owner：先查 `Account`（`where { userId, owner: ownerName }`），拿到 accountIds，再查 holdings
3. 拉取 holdings（包含 fund 关系），并按 fundCode 汇总 shares（owner 维度需要；account 维度也可统一走同一逻辑）
4. 对每个 fundCode 调用一次 `getFundQuote`，计算净值口径金额
5. 通过 `Fund.categoryId -> FundCategory(parent)` 得到大类/小类名称；空/不合法进入“未分类”
6. 计算：
   - 每只基金 pct
   - 每个小类小计 value/pct
   - 每个大类小计 value/pct
   - totalValue
7. 按排序规则输出

## 边界与错误处理

- totalValue=0：所有 pct 显示 `—` 或 0；表格仍返回空 groups + totalValue=0
- quote 拉取失败：该基金金额按 0 处理，并在前端以灰色展示（可选）
- 未找到账户/归属人：返回 404 或空结果（建议 404，前端提示“选择无效/已删除”）

## 验收标准

- 首页新增 `统计` Tab，刷新后能记住上次选择
- 维度切换与抽屉选择能触发统计刷新
- 表格包含：基金明细、小类小计、大类小计、总计，且占比计算正确
- 归属人维度会合并该归属人名下多个账户的同一基金，不重复展示

