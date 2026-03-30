"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ScreenshotParsedRow } from "@/services/screenshotImportService";

type RowEdit = ScreenshotParsedRow & { id: string };

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
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<RowEdit[]>([]);
  const [syncWatchlist, setSyncWatchlist] = useState(false);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [accountId, setAccountId] = useState("");

  const reset = useCallback(() => {
    setPhase("pick");
    setMessage(null);
    setRows([]);
    setSyncWatchlist(false);
    setAccounts([]);
    setAccountId("");
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

  const runParseFile = useCallback(async (file: File) => {
    const max = 8 * 1024 * 1024;
    if (file.size > max) {
      setMessage(`图片须小于 ${Math.floor(max / (1024 * 1024))}MB`);
      return;
    }
    setMessage(null);
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
        setMessage(err);
        setPhase("pick");
        return;
      }
      const list = Array.isArray(data.rows) ? data.rows : [];
      if (list.length === 0) {
        setMessage("未从截图中识别到基金持仓，请换一张或检查清晰度");
        setPhase("pick");
        return;
      }
      setRows(list.map((r) => ({ ...r, id: newRowId() })));
      setPhase("preview");
    } catch {
      setMessage("读取或上传失败，请重试");
      setPhase("pick");
    }
  }, []);

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
      setMessage("请先选择导入账户");
      return;
    }
    const items = rows
      .map((r) => ({
        fundCode: r.fundCode.trim(),
        fundName: r.fundName?.trim() || undefined,
        shares: r.shares ?? NaN,
        costPrice: r.costPrice ?? NaN,
      }))
      .filter((r) => /^\d{6}$/.test(r.fundCode) && Number.isFinite(r.shares) && r.shares > 0 &&
        Number.isFinite(r.costPrice) && r.costPrice >= 0);

    if (items.length === 0) {
      setMessage("请至少保留一行有效数据：6 位代码、份额 > 0、成本 ≥ 0");
      return;
    }

    setMessage(null);
    setPhase("submitting");
    try {
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
        setMessage(typeof data.error === "string" ? data.error : "导入失败");
        setPhase("preview");
        return;
      }
      const errs = data.errors?.length ? `部分失败：${data.errors.slice(0, 3).join("；")}` : "";
      if (errs) setMessage(errs);
      onImported();
      handleClose();
    } catch {
      setMessage("导入失败，请重试");
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-xl border border-[#dbe5ff] bg-white shadow-xl">
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
                <table className="w-full min-w-[520px] border-collapse text-left text-xs">
                  <thead className="bg-[#f5f8ff] text-[#5e6f95]">
                    <tr>
                      <th className="px-2 py-2 font-medium">代码</th>
                      <th className="px-2 py-2 font-medium">名称</th>
                      <th className="px-2 py-2 font-medium">份额</th>
                      <th className="px-2 py-2 font-medium">成本</th>
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
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.id === r.id ? { ...x, fundCode: e.target.value } : x,
                                ),
                              )
                            }
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

          {message && (
            <p className="mt-3 text-xs text-red-600" role="alert">
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
