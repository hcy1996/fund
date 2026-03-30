"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ScreenshotParsedRow } from "@/services/screenshotImportService";
import type { FundCategoryTreeNode } from "@/services/fundCategoryService";
import { useMessage } from "@/components/common/message-provider";

type RowEdit = ScreenshotParsedRow & { id: string; categoryId: string | null };

function newRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function fileToBase64AndMime(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== "string" || !r.includes(",")) {
        reject(new Error("读取失败"));
        return;
      }
      const [prefix, b64] = r.split(",");
      const mimeMatch = /^data:([^;]+);/.exec(prefix);
      const mediaType = mimeMatch?.[1] || file.type || "image/png";
      if (
        mediaType !== "image/png" &&
        mediaType !== "image/jpeg" &&
        mediaType !== "image/gif" &&
        mediaType !== "image/webp"
      ) {
        reject(new Error("请使用 PNG、JPEG、GIF 或 WebP 截图"));
        return;
      }
      resolve({ base64: b64, mediaType });
    };
    reader.onerror = () => reject(reader.error ?? new Error("读取失败"));
    reader.readAsDataURL(file);
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  /** 打开弹窗时默认选中的账户（通常传首页当前选中的账户） */
  defaultAccountId?: string | null;
};

type AccountItem = {
  id: string;
  name: string;
};

export function ScreenshotImportModal({ open, onClose, onImported, defaultAccountId }: Props) {
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"pick" | "parsing" | "preview" | "submitting">("pick");
  const [rows, setRows] = useState<RowEdit[]>([]);
  const [syncWatchlist, setSyncWatchlist] = useState(false);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [accountId, setAccountId] = useState("");
  const message = useMessage();
  const [categoryTree, setCategoryTree] = useState<FundCategoryTreeNode[]>([]);

  const smallCategoryOptions = useMemo(() => {
    return categoryTree.flatMap((big) =>
      big.children.map((c) => ({
        id: c.id,
        label: `${big.name}-${c.name}`,
      })),
    );
  }, [categoryTree]);

  const readStoredCategoryIdByCode = useCallback((): Record<string, string> => {
    if (typeof window === "undefined") return {};
    const key = "fund:screenshotImport:smallCategoryByCode:v1";
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return {};
      return parsed as Record<string, string>;
    } catch {
      return {};
    }
  }, []);

  const writeStoredCategoryIdByCode = useCallback((next: Record<string, string>) => {
    if (typeof window === "undefined") return;
    const key = "fund:screenshotImport:smallCategoryByCode:v1";
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const reset = useCallback(() => {
    setPhase("pick");
    setRows([]);
    setSyncWatchlist(false);
    setAccounts([]);
    setAccountId("");
    setCategoryTree([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await fetch("/api/accounts");
      if (!res.ok) return;
      const data = (await res.json()) as AccountItem[];
      setAccounts(data);
      const preferred =
        defaultAccountId && data.some((a) => a.id === defaultAccountId) ? defaultAccountId : data[0]?.id ?? "";
      setAccountId(preferred);
    })();
  }, [open, defaultAccountId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/fund-categories");
        if (!res.ok) return;
        const data = (await res.json()) as { categories?: FundCategoryTreeNode[] };
        if (cancelled) return;
        setCategoryTree(Array.isArray(data.categories) ? data.categories : []);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const isRowValidForImport = useCallback((r: RowEdit) => {
    const code = r.fundCode.trim();
    const shares = r.shares ?? NaN;
    const costPrice = r.costPrice ?? NaN;
    return (
      /^\d{6}$/.test(code) &&
      Number.isFinite(shares) &&
      shares > 0 &&
      Number.isFinite(costPrice) &&
      costPrice >= 0
    );
  }, []);

  const tryLoadCategoryByCode = useCallback(
    async (rowId: string, code: string) => {
      // 后端：以已配置的小类为准；若后端没配置，则保留本地兜底值
      try {
        const res = await fetch(`/api/funds/category?code=${encodeURIComponent(code)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { categoryId: string | null; label: string | null };
        if (!data.categoryId) return;
        setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, categoryId: data.categoryId } : r)));
      } catch {
        // ignore
      }
    },
    [],
  );

  const runParseFile = useCallback(async (file: File) => {
    const max = 8 * 1024 * 1024;
    if (file.size > max) {
      message.error(`图片须小于 ${Math.floor(max / (1024 * 1024))}MB`);
      return;
    }
    setPhase("parsing");
    try {
      const { base64, mediaType } = await fileToBase64AndMime(file);
      const res = await fetch("/api/imports/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: unknown;
        rows?: ScreenshotParsedRow[];
      };
      if (!res.ok) {
        const err =
          typeof data.error === "string"
            ? data.error
            : res.status === 503
              ? "未配置识别服务密钥，请联系管理员"
              : "识别请求失败";
        message.error(err);
        setPhase("pick");
        return;
      }
      const list = Array.isArray(data.rows) ? data.rows : [];
      if (list.length === 0) {
        message.error("未从截图中识别到基金持仓，请换一张或检查清晰度");
        setPhase("pick");
        return;
      }

      const stored = readStoredCategoryIdByCode();
      const nextRows: RowEdit[] = list.map((r) => {
        const code = r.fundCode?.trim?.() ? String(r.fundCode).trim() : "";
        return {
          ...(r as ScreenshotParsedRow),
          id: newRowId(),
          categoryId: code ? stored[code] ?? null : null,
        };
      });

      setRows(nextRows);
      setPhase("preview");

      // 后端回填：优先使用后台已设置的小类（如果有）
      void (async () => {
        const codes = nextRows
          .map((r) => r.fundCode.trim())
          .filter((c) => /^\d{6}$/.test(c));
        const uniqueCodes = Array.from(new Set(codes));
        if (uniqueCodes.length === 0) return;

        // 逐行回填，避免一个代码对应多个行时状态错位
        await Promise.allSettled(
          nextRows.map(async (row) => {
            const code = row.fundCode.trim();
            if (!/^\d{6}$/.test(code)) return;
            if (!code) return;
            if (row.categoryId) {
              // 本地已兜底：仍然尝试拉取后台（若后台无配置则保持本地）
            }
            await tryLoadCategoryByCode(row.id, code);
          }),
        );
      })();
    } catch {
      message.error("读取或上传失败，请重试");
      setPhase("pick");
    }
  }, [message, readStoredCategoryIdByCode, tryLoadCategoryByCode]);

  useEffect(() => {
    if (!open) return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it?.kind === "file" && it.type.startsWith("image/")) {
          e.preventDefault();
          const f = it.getAsFile();
          if (f) void runParseFile(f);
          break;
        }
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, runParseFile]);

  const handleImport = async () => {
    if (!accountId) {
      message.error("请先选择导入账户");
      return;
    }
    const validRows = rows.filter((r) => isRowValidForImport(r));
    const missingCategoryRow = validRows.find((r) => !r.categoryId);

    if (missingCategoryRow) {
      const code = missingCategoryRow.fundCode.trim();
      message.error(`代码 ${code} 的这行尚未选择“小类”。`);
      return;
    }

    const items = validRows.map((r) => ({
      fundCode: r.fundCode.trim(),
      fundName: r.fundName?.trim() || undefined,
      shares: r.shares ?? NaN,
      costPrice: r.costPrice ?? NaN,
    }));

    if (items.length === 0) {
      message.error("请至少保留一行有效数据：6 位代码、份额 > 0、成本 ≥ 0");
      return;
    }

    setPhase("submitting");
    try {
      // 先把每行选择的小类落到基金配置里：导入接口本身会校验“小类”存在
      const unique = new Map<string, string>();
      for (const r of validRows) {
        unique.set(r.fundCode.trim(), r.categoryId!);
      }
      const putErrors: string[] = [];
      for (const [code, categoryId] of unique.entries()) {
        const res = await fetch("/api/funds/category", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, categoryId }),
        });
        if (!res.ok) {
          putErrors.push(`${code}: 设置小类失败`);
        }
      }
      if (putErrors.length) {
        message.error(`设置分类失败：${putErrors.slice(0, 3).join("；")}`);
        setPhase("preview");
        return;
      }

      const res = await fetch("/api/holdings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, syncWatchlist, accountId: accountId || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: unknown;
        created?: number;
        updated?: number;
        errors?: string[];
      };
      if (!res.ok) {
        message.error(typeof data.error === "string" ? data.error : "导入失败");
        setPhase("preview");
        return;
      }
      const errs = data.errors?.length ? `部分失败：${data.errors.slice(0, 3).join("；")}` : "";
      if (errs) message.error(errs);
      // 把本次选择缓存到本地，下一次截图导入可直接回填
      const stored = readStoredCategoryIdByCode();
      for (const r of validRows) stored[r.fundCode.trim()] = r.categoryId!;
      writeStoredCategoryIdByCode(stored);
      onImported();
      handleClose();
    } catch {
      message.error("导入失败，请重试");
      setPhase("preview");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl border border-[#dbe5ff] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#e8efff] px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-[#1f2a44]">
            截图导入持仓
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md px-2 py-1 text-sm text-[#6a7ea8] hover:bg-[#f5f8ff]"
          >
            关闭
          </button>
        </div>

        <div className="max-h-[calc(90vh-52px)] overflow-auto px-4 py-3">
          {phase === "pick" || phase === "parsing" ? (
            <div className="space-y-3">
              <p className="text-xs text-[#6a7ea8]">
                上传或粘贴（Ctrl+V）持仓截图。支持支付宝「我的持有」（名称 + 金额 + 持有收益/率，无代码时会用东财搜索匹配并推算份额与成本）、天天基金等。请在下一步校对。
              </p>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#c8d8f4] bg-[#f8fbff] px-4 py-8 text-center text-sm text-[#5e6f95] hover:border-[#1677ff] hover:bg-[#f0f6ff]">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void runParseFile(f);
                  }}
                />
                <span className="font-medium text-[#1677ff]">选择截图文件</span>
                <span className="mt-1 text-xs text-[#8ea1c8]">或在窗口内直接粘贴图片</span>
              </label>
              {phase === "parsing" && (
                <p className="text-center text-sm text-[#1677ff]">识别中，请稍候…</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[#6a7ea8]">
                请核对下列数据。已持有的基金将更新为表格中的份额与成本。
              </p>
              <div className="overflow-x-auto rounded-lg border border-[#e8efff]">
                <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                  <thead className="bg-[#f5f8ff] text-[#5e6f95]">
                    <tr>
                      <th className="px-2 py-2 font-medium">代码</th>
                      <th className="px-2 py-2 font-medium">名称</th>
                      <th className="px-2 py-2 font-medium">份额</th>
                      <th className="px-2 py-2 font-medium">成本</th>
                      <th className="px-2 py-2 font-medium">小类</th>
                      <th className="w-10 px-1 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-[#eef2fb]">
                        <td className="px-2 py-1.5">
                          <input
                            className="w-full rounded border border-[#dbe5ff] bg-white px-1 py-0.5 font-mono text-[11px] outline-none focus:ring-1 focus:ring-[#1677ff]"
                            value={r.fundCode}
                            onChange={(e) => {
                              const nextCode = e.target.value;
                              const trimmed = nextCode.trim();
                              const stored = readStoredCategoryIdByCode();
                              const nextCategoryId =
                                /^\d{6}$/.test(trimmed) && stored[trimmed] ? stored[trimmed] : null;

                              setRows((prev) =>
                                prev.map((x) =>
                                  x.id === r.id
                                    ? {
                                        ...x,
                                        fundCode: nextCode,
                                        categoryId: nextCategoryId,
                                      }
                                    : x,
                                ),
                              );

                              if (/^\d{6}$/.test(trimmed)) {
                                void tryLoadCategoryByCode(r.id, trimmed);
                              }
                            }}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className="w-full min-w-28 rounded border border-[#dbe5ff] bg-white px-1 py-0.5 outline-none focus:ring-1 focus:ring-[#1677ff]"
                            value={r.fundName ?? ""}
                            placeholder="可选"
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.id === r.id
                                    ? { ...x, fundName: e.target.value || undefined }
                                    : x,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            className="w-full rounded border border-[#dbe5ff] bg-white px-1 py-0.5 outline-none focus:ring-1 focus:ring-[#1677ff]"
                            value={r.shares ?? ""}
                            placeholder="—"
                            onChange={(e) => {
                              const v = e.target.value;
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.id === r.id
                                    ? {
                                        ...x,
                                        shares:
                                          v === "" || v === "-"
                                            ? null
                                            : Number.parseFloat(v),
                                      }
                                    : x,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            className="w-full rounded border border-[#dbe5ff] bg-white px-1 py-0.5 outline-none focus:ring-1 focus:ring-[#1677ff]"
                            value={r.costPrice ?? ""}
                            placeholder="—"
                            onChange={(e) => {
                              const v = e.target.value;
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.id === r.id
                                    ? {
                                        ...x,
                                        costPrice:
                                          v === "" || v === "-"
                                            ? null
                                            : Number.parseFloat(v),
                                      }
                                    : x,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            className={[
                              "w-full rounded border bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#1677ff]",
                              isRowValidForImport(r) && !r.categoryId
                                ? "border-red-300"
                                : "border-[#dbe5ff]",
                            ].join(" ")}
                            value={r.categoryId ?? ""}
                            disabled={
                              !/^\d{6}$/.test(r.fundCode.trim()) || smallCategoryOptions.length === 0
                            }
                            onChange={(e) => {
                              const nextId = e.target.value ? e.target.value : null;
                              setRows((prev) =>
                                prev.map((x) => (x.id === r.id ? { ...x, categoryId: nextId } : x)),
                              );
                              const code = r.fundCode.trim();
                              if (!code) return;
                              const stored = readStoredCategoryIdByCode();
                              if (nextId) stored[code] = nextId;
                              else delete stored[code];
                              writeStoredCategoryIdByCode(stored);
                            }}
                          >
                            <option value="">请选择小类</option>
                            {smallCategoryOptions.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <button
                            type="button"
                            className="text-[#9aa9c7] hover:text-red-500"
                            title="删除此行"
                            aria-label="删除此行"
                            onClick={() =>
                              setRows((prev) => prev.filter((x) => x.id !== r.id))
                            }
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs text-[#5e6f95]">
                <input
                  type="checkbox"
                  checked={syncWatchlist}
                  onChange={(e) => setSyncWatchlist(e.target.checked)}
                  className="rounded border-[#c8d8f4]"
                />
                同步加入自选「全部」
              </label>

              <label className="flex items-center gap-2 text-xs text-[#5e6f95]">
                <span>导入到账户</span>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="rounded border border-[#dbe5ff] bg-white px-2 py-1 text-xs text-[#1f2a44] outline-none focus:ring-1 focus:ring-[#1677ff]"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPhase("pick");
                    setRows([]);
                  }}
                  className="rounded-md border border-[#dbe5ff] bg-white px-3 py-1.5 text-sm text-[#5e6f95]"
                >
                  重新选图
                </button>
                <button
                  type="button"
                  disabled={phase === "submitting"}
                  onClick={() => void handleImport()}
                  className="rounded-md bg-[#1677ff] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0e66e8] disabled:opacity-50"
                >
                  {phase === "submitting" ? "导入中…" : "确认导入"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
