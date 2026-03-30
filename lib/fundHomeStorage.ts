/** 与首页持仓账户选中同步，供头部搜索跳转 `/search` 时附带 accountId */
export function activeAccountStorageKey(userId: string) {
  return `fund-home:activeAccountId:${userId}`;
}
