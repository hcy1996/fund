/** 将持仓改到目标账户时，该账户已存在同一基金的另一条持仓 */
export class HoldingMoveConflictError extends Error {
  constructor(message = "目标账户已持有该基金，请先删除或合并其中一条后再移动") {
    super(message);
    this.name = "HoldingMoveConflictError";
  }
}
