"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type FundCategoryTreeNode = {
  id: string;
  name: string;
  sortOrder: number;
  children: FundCategoryTreeNode[];
};

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-[#dbe5ff] bg-white p-4 text-sm text-[#6a7ea8]">
      暂无分类数据
    </div>
  );
}

export default function FundCategoriesAdminPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<FundCategoryTreeNode[]>([]);

  const [newBigName, setNewBigName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fund-categories");
      if (!res.ok) throw new Error("加载分类失败");
      const j = (await res.json()) as { categories: FundCategoryTreeNode[] };
      setTree(j.categories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadAfter = useCallback(async () => {
    await load();
  }, [load]);

  const updateName = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/fund-categories/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!res.ok) throw new Error("更新失败");
        await reloadAfter();
      } catch (e) {
        setError(e instanceof Error ? e.message : "更新失败");
      } finally {
        setSaving(false);
      }
    },
    [reloadAfter],
  );

  const createCategory = useCallback(
    async (input: { name: string; parentId?: string | null }) => {
      const trimmed = input.name.trim();
      if (!trimmed) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/fund-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, parentId: input.parentId ?? null }),
        });
        if (!res.ok) throw new Error("新增失败");
        await reloadAfter();
      } catch (e) {
        setError(e instanceof Error ? e.message : "新增失败");
      } finally {
        setSaving(false);
      }
    },
    [reloadAfter],
  );

  const deleteCategory = useCallback(
    async (id: string, name: string) => {
      const ok = window.confirm(`确认删除「${name}」？（会级联删除其下级小类）`);
      if (!ok) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/fund-categories/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!res.ok) throw new Error("删除失败");
        await reloadAfter();
      } catch (e) {
        setError(e instanceof Error ? e.message : "删除失败");
      } finally {
        setSaving(false);
      }
    },
    [reloadAfter],
  );

  const sortedTree = useMemo(() => {
    // API 已排序；这里只保留兜底
    return [...tree].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [tree]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-[#1f2a44]">基金分类后台管理</h1>
      </div>

      <div className="rounded-lg border border-[#dbe5ff] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="w-full rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-3 py-2 text-sm text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30 sm:w-[20rem]"
            value={newBigName}
            onChange={(e) => setNewBigName(e.target.value)}
            placeholder="新增大类名称（如：债券）"
          />
          <button
            type="button"
            disabled={saving || !newBigName.trim()}
            onClick={() => {
              void createCategory({ name: newBigName, parentId: null });
              setNewBigName("");
            }}
            className="rounded-md bg-[#1677ff] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-[#0e66e8]"
          >
            新增大类
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-sm text-[#8ea1c8]">加载中…</div>
      ) : sortedTree.length < 1 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {sortedTree.map((big) => (
            <div key={big.id} className="rounded-lg border border-[#dbe5ff] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    className="w-full rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-3 py-2 text-sm text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
                    defaultValue={big.name}
                    onBlur={(e) => void updateName(big.id, e.target.value)}
                    disabled={saving}
                    aria-label={`编辑大类 ${big.name}`}
                  />
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void deleteCategory(big.id, big.name)}
                  className="rounded-md border border-[#dbe5ff] bg-white px-3 py-2 text-xs font-medium text-[#5e6f95] hover:bg-[#f5f8ff]"
                >
                  删除大类
                </button>
              </div>

              <div className="mt-3 space-y-2">
                <div className="text-xs font-medium text-[#8ea1c8]">小类</div>
                {big.children.length < 1 ? (
                  <div className="rounded-md border border-dashed border-[#e8efff] bg-[#fbfcff] px-3 py-2 text-sm text-[#8ea1c8]">
                    暂无小类
                  </div>
                ) : (
                  <div className="space-y-2">
                    {big.children
                      .slice()
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((small) => (
                        <div key={small.id} className="flex flex-wrap items-center gap-2">
                          <input
                            className="flex-1 rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-3 py-2 text-sm text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
                            defaultValue={small.name}
                            onBlur={(e) => void updateName(small.id, e.target.value)}
                            disabled={saving}
                            aria-label={`编辑小类 ${small.name}`}
                          />
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void deleteCategory(small.id, small.name)}
                            className="rounded-md border border-[#dbe5ff] bg-white px-3 py-2 text-xs font-medium text-[#5e6f95] hover:bg-[#f5f8ff]"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                <AddSmallForm
                  saving={saving}
                  parentName={big.name}
                  onAdd={(name) => void createCategory({ name, parentId: big.id })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* empty */}
    </div>
  );
}

function AddSmallForm({
  saving,
  parentName,
  onAdd,
}: {
  saving: boolean;
  parentName: string;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <input
        className="flex-1 rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-3 py-2 text-sm text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`在「${parentName}」下新增小类`}
        disabled={saving}
      />
      <button
        type="button"
        disabled={saving || !name.trim()}
        onClick={() => {
          onAdd(name);
          setName("");
        }}
        className="rounded-md bg-[#1677ff] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-[#0e66e8]"
      >
        新增小类
      </button>
    </div>
  );
}

