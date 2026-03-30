import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(6, "密码至少 6 位"),
});

export const holdingCreateSchema = z.object({
  fundCode: z.string().min(1, "请填写基金代码"),
  fundName: z.string().optional(),
  shares: z.coerce.number().positive("份额必须大于 0"),
  costPrice: z.coerce.number().nonnegative("成本不能为负"),
  accountId: z.string().min(1).optional(),
});

export const holdingUpdateSchema = z.object({
  shares: z.coerce.number().positive().optional(),
  costPrice: z.coerce.number().nonnegative().optional(),
  /** 修改所属账户（跨账户移动） */
  accountId: z.string().min(1).optional(),
});

export const holdingReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const watchlistGroupCreateSchema = z.object({
  name: z.string().min(1, "分组名不能为空").max(30, "分组名最多 30 字"),
  sortOrder: z.coerce.number().int().optional(),
});

export const watchlistGroupUpdateSchema = z.object({
  name: z.string().min(1).max(30).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const watchlistGroupReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const watchlistItemCreateSchema = z.object({
  fundCode: z.string().min(1, "基金代码不能为空"),
  fundName: z.string().optional(),
  groupIds: z.array(z.string().min(1)).min(1, "至少选择一个分组"),
});

export const watchlistItemRemoveFromGroupSchema = z.object({
  itemId: z.string().min(1),
  groupId: z.string().min(1),
});

export const watchlistItemSyncGroupsSchema = z.object({
  fundCode: z.string().min(1, "基金代码不能为空"),
  fundName: z.string().optional(),
  groupIds: z.array(z.string().min(1)),
});

export const fundNavHistoryQuerySchema = z.object({
  code: z.string().min(1, "缺少基金代码"),
  range: z
    .enum(["1m", "3m", "6m", "1y", "3y", "5y", "max"])
    .optional()
    .transform((v) => v ?? "3m"),
});

/** 截图识别上传（Base64，不含 data: 前缀） */
export const screenshotUploadSchema = z.object({
  imageBase64: z.string().min(100).max(12_000_000),
  mediaType: z
    .enum(["image/png", "image/jpeg", "image/gif", "image/webp"])
    .optional()
    .default("image/png"),
});

export const holdingsImportBodySchema = z.object({
  items: z.array(holdingCreateSchema).min(1).max(80),
  syncWatchlist: z.boolean().optional(),
  accountId: z.string().min(1).optional(),
});
