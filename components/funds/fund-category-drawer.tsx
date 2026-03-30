"use client";

import { useEffect, useMemo, useState } from "react";
import type { FundCategoryTreeNode } from "@/services/fundCategoryService";

type Props = {
  open: boolean;
  onClose: () => void;
  fundCode: string;
  currentCategoryId: string | null;
  onSaved?: (categoryId: string | null) => void;
};

type ApiCategoryInfo = { categories?: FundCategoryTreeNode[] };

export function FundCategoryDrawer({ open, onClose, fundCode, currentCategoryId, onSaved }: Props) {
  const [tree, setTree] = useState<FundCategoryTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(currentCategoryId);

  useEffect(() => {
    if (!open) return;
    setSelectedId(currentCategoryId);
  }, [open, currentCategoryId]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch("/api/fund-categories");
        if (!res.ok) throw new Error("load failed");
        const data = (await res.json()) as ApiCategoryInfo;
        const categories = Array.isArray(data.categories) ? data.categories : [];
        if (!cancelled) setTree(categories);
      } catch {
        if (!cancelled) setError("加载分类失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectableSmallIds = useMemo(() => {
    // FundCategoryTreeNode：大类在 tree 里，children 为小类
    return tree.flatMap((big) => big.children.map((c) => c.id));
  }, [tree]);
  const selectedIsValid = useMemo(() => {
    if (!selectedId) return true;
    // 分类树尚未加载完成时，不要把已有选择误判为无效并清空
    if (selectableSmallIds.length === 0) return true;
    return selectableSmallIds.includes(selectedId);
  }, [selectableSmallIds, selectedId]);

  useEffect(() => {
    if (open && selectedId && !selectedIsValid) setSelectedId(null);
  }, [open, selectedId, selectedIsValid]);

  async function handleSave() {
    if (!selectedId) {
      setError("请选择一个小类后再保存");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/funds/category", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: fundCode, categoryId: selectedId }),
      });
      if (!res.ok) {
        setError("保存失败");
        return;
      }
      onSaved?.(selectedId);
      onClose();
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-sm flex-col border-l border-[#dbe5ff] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#e8efff] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1f2a44]">关联分类</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-[#6a7ea8] hover:bg-[#f5f8ff]"
          >
            关闭
          </button>
        </div>

        <div className="border-b border-[#f0f4ff] px-4 py-2 text-xs text-[#6a7ea8]">
          {fundCode}
          <span className="ml-1 text-[#9baccb]">（选中后显示在页面顶部）</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!loading ? (
            tree.length === 0 ? (
              <p className="text-sm text-[#6a7ea8]">暂无分类</p>
            ) : (
              <ul className="space-y-3">
                {tree.map((big) => (
                  <li key={big.id}>
                    <p className="mb-1 text-xs font-semibold text-[#1f2a44]">{big.name}</p>
                    <ul className="space-y-1">
                      {big.children.map((small) => (
                        <li key={small.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(small.id)}
                            className={[
                              "mt-1 w-full rounded-lg border px-3 py-2 text-left text-sm",
                              selectedId === small.id
                                ? "border-[#1677ff] bg-[#eef5ff] text-[#1677ff]"
                                : "border-[#e8efff] bg-[#f9fbff] text-[#1f2a44] hover:bg-[#f5f8ff]",
                            ].join(" ")}
                          >
                            <span className="block pl-2 text-[13px] font-normal">{small.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="text-sm text-[#6a7ea8]">加载中…</p>
          )}

          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>

        <div className="border-t border-[#e8efff] px-4 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex-1 rounded-md bg-[#1677ff] py-2 text-sm font-medium text-white hover:bg-[#0e66e8] disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

