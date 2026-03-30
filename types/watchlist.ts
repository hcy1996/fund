import type { FundQuote } from "@/types/fund";

export type WatchlistGroupDto = {
  id: string;
  name: string;
  sortOrder: number;
};

export type WatchlistItemDto = {
  id: string;
  fundCode: string;
  fundName: string;
};

export type WatchlistItemWithQuote = WatchlistItemDto & {
  quote?: FundQuote;
  /** 非「全部」分组的分组名称，仅在「全部」汇总列表中返回 */
  groupLabels?: string[];
};

export type WatchlistGroupedDto = {
  groups: Array<{
    id: string;
    name: string;
    sortOrder: number;
    items: WatchlistItemWithQuote[];
  }>;
};
