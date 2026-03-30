"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { DEFAULT_WATCHLIST_GROUP_NAME } from "@/lib/watchlistConstants";
import type { WatchlistGroupDto } from "@/types/watchlist";

type Props = {
  open: boolean;
  onClose: () => void;
  fundCode: string;
  fundName: string;
  onSaved?: () => void;
};

export function WatchlistGroupDrawer({ open, onClose, fundCode, fundName, onSaved }: Props) {
  const { data: session } = useSession();
  const [groups, setGroups] = useState<WatchlistGroupDto[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session?.user || !fundCode) return;
    setLoading(true);
    setError(null);
    try {
      const [gRes, mRes] = await Promise.all([
        fetch("/api/watchlists/groups"),
        fetch(`/api/watchlists/items/by-fund?fundCode=${encodeURIComponent(fundCode)}`),
      ]);
      if (!gRes.ok) {
        setGroups([]);
        setError("加载分组失败");
        return;
      }
      const gRows = (await gRes.json()) as WatchlistGroupDto[];
      setGroups(gRows);
      const defaultG = gRows.find((g) => g.name === DEFAULT_WATCHLIST_GROUP_NAME);
      const defaultId = defaultG?.id;
      if (mRes.ok) {
        const m = (await mRes.json()) as { groupIds: string[] };
        const customOnly = defaultId
          ? m.groupIds.filter((id) => id !== defaultId)
          : [...m.groupIds];
        setPicked(new Set(customOnly));
      } else {
        setPicked(new Set());
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [session?.user, fundCode]);

  useEffect(() => {
    if (open && session?.user) {
      void loadData();
    }
  }, [open, session?.user, loadData]);

  useEffect(() => {
    if (!open) {
      setNewName("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const defaultGroupId = useMemo(
    () => groups.find((g) => g.name === DEFAULT_WATCHLIST_GROUP_NAME)?.id,
    [groups],
  );

  const visibleGroups = useMemo(
    () => groups.filter((g) => g.name !== DEFAULT_WATCHLIST_GROUP_NAME),
    [groups],
  );

  async function createGroup() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/watchlists/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setError("创建分组失败");
      return;
    }
    const created = (await res.json()) as WatchlistGroupDto;
    setNewName("");
    setGroups((prev) => [...prev, created]);
    setPicked((prev) => new Set([...prev, created.id]));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const customIds = [...picked];
      const groupIdsToSync =
        customIds.length > 0 ? customIds : defaultGroupId ? [defaultGroupId] : [];
      const res = await fetch("/api/watchlists/items/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fundCode,
          fundName,
          groupIds: groupIdsToSync,
        }),
      });
      if (!res.ok) {
        setError("保存失败");
        return;
      }
      onSaved?.();
      onClose();
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
          <h2 className="text-sm font-semibold text-[#1f2a44]">加入自选分组</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-[#6a7ea8] hover:bg-[#f5f8ff]"
          >
            关闭
          </button>
        </div>
        <p className="border-b border-[#f0f4ff] px-4 py-2 text-xs text-[#6a7ea8]">
          {fundName} <span className="text-[#9baccb]">{fundCode}</span>
          <span className="mt-1 block text-[#9baccb]">
            未选自定义分组时：若存在「{DEFAULT_WATCHLIST_GROUP_NAME}」则归入其中；否则将从自选中移除。
          </span>
        </p>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!session?.user ? (
            <p className="text-sm text-[#6a7ea8]">请先登录后再管理自选分组。</p>
          ) : loading ? (
            <p className="text-sm text-[#6a7ea8]">加载中…</p>
          ) : visibleGroups.length === 0 ? (
            <p className="text-sm text-[#6a7ea8]">
              暂无自定义分组，可在下方新建；保存时归入「{DEFAULT_WATCHLIST_GROUP_NAME}」（若该分组不存在则从自选移除）。
            </p>
          ) : (
            <ul className="space-y-2">
              {visibleGroups.map((g) => (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#e8efff] bg-[#f9fbff] px-3 py-2.5 text-sm text-[#1f2a44] hover:bg-[#f5f8ff]">
                    <input
                      type="checkbox"
                      checked={picked.has(g.id)}
                      onChange={() => toggle(g.id)}
                      className="rounded border-[#dbe5ff]"
                    />
                    <span>{g.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
        {session?.user && (
          <div className="border-t border-[#e8efff] px-4 py-3">
            <p className="mb-2 text-xs text-[#8ea1c8]">新建分组</p>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createGroup();
                  }
                }}
                placeholder="分组名称"
                className="min-w-0 flex-1 rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2.5 py-1.5 text-xs text-[#1f2a44]"
              />
              <button
                type="button"
                onClick={() => void createGroup()}
                className="shrink-0 rounded-md border border-[#dbe5ff] bg-white px-2.5 py-1.5 text-xs text-[#5e6f95] hover:bg-[#f5f8ff]"
              >
                创建
              </button>
            </div>
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => void handleSave()}
              className="mt-3 w-full rounded-md bg-[#1677ff] py-2 text-sm font-medium text-white hover:bg-[#0e66e8] disabled:opacity-50"
            >
              {saving ? "保存中…" : "确定"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
