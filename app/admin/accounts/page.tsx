"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type AccountRow = {
  id: string;
  name: string;
  owner: string;
};

type OwnerRow = {
  id: string;
  name: string;
  sortOrder: number;
};

export default function AdminAccountsPage() {
  const { status } = useSession();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [ownersError, setOwnersError] = useState<string | null>(null);

  const [newOwnerName, setNewOwnerName] = useState("");
  const [ownersSaving, setOwnersSaving] = useState(false);
  const [ownersCrudError, setOwnersCrudError] = useState<string | null>(null);

  async function loadAccounts() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts");
      if (!res.ok) throw new Error("加载账户失败");
      const data = (await res.json()) as AccountRow[];
      setRows(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadOwners() {
    setOwnersLoading(true);
    setOwnersError(null);
    try {
      const res = await fetch("/api/account-owners");
      if (!res.ok) throw new Error("加载归属人失败");
      const j = (await res.json()) as { owners: OwnerRow[] };
      setOwners(j.owners ?? []);
    } catch (e) {
      setOwnersError(e instanceof Error ? e.message : "加载归属人失败");
    } finally {
      setOwnersLoading(false);
    }
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    void (async () => {
      await Promise.all([loadAccounts(), loadOwners()]);
    })();
  }, [status]);

  async function updateAccountOwner(accountId: string, nextOwner: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: nextOwner }),
      });
      if (!res.ok) throw new Error("更新失败");
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    } finally {
      setLoading(false);
    }
  }

  async function addOwner() {
    const trimmed = newOwnerName.trim();
    if (!trimmed) return;
    setOwnersCrudError(null);
    setOwnersSaving(true);
    try {
      const res = await fetch("/api/account-owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error("新增失败");
      setNewOwnerName("");
      await loadOwners();
    } catch (e) {
      setOwnersCrudError(e instanceof Error ? e.message : "新增失败");
    } finally {
      setOwnersSaving(false);
    }
  }

  async function renameOwner(ownerId: string, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    setOwnersCrudError(null);
    setOwnersSaving(true);
    try {
      const res = await fetch(`/api/account-owners/${encodeURIComponent(ownerId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error("重命名失败");
      await loadOwners();
      await loadAccounts();
    } catch (e) {
      setOwnersCrudError(e instanceof Error ? e.message : "重命名失败");
    } finally {
      setOwnersSaving(false);
    }
  }

  async function deleteOwner(ownerId: string, name: string) {
    const ok = window.confirm(`确认删除「${name}」？将要求相关账户取消/调整后才能删除。`);
    if (!ok) return;
    setOwnersCrudError(null);
    setOwnersSaving(true);
    try {
      const res = await fetch(`/api/account-owners/${encodeURIComponent(ownerId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "删除失败");
      }
      await loadOwners();
      await loadAccounts();
    } catch (e) {
      setOwnersCrudError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setOwnersSaving(false);
    }
  }

  const ownerOptions = useMemo(() => owners.slice().sort((a, b) => a.sortOrder - b.sortOrder), [owners]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-[#1f2a44]">账户管理</h1>
      </div>

      {status !== "authenticated" ? (
        <div className="rounded-lg border border-[#dbe5ff] bg-white p-4 text-sm text-[#6a7ea8]">请先登录后再管理账户。</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : loading && rows.length < 1 ? (
        <div className="text-sm text-[#8ea1c8]">加载中…</div>
      ) : (
        <div className="rounded-lg border border-[#dbe5ff] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2">
            {rows.map((r) => {
              const options = ownerOptions.some((o) => o.name === r.owner)
                ? ownerOptions
                : [{ id: "current", name: r.owner, sortOrder: -1 }, ...ownerOptions];
              return (
                <label
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#e8efff] bg-[#fbfcff] px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-[#1f2a44]">
                    {r.name} <span className="ml-2 text-xs text-[#8ea1c8] font-mono">({r.id.slice(0, 6)})</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-[#8ea1c8]">统计口径</span>
                    <select
                      className="w-44 rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2 py-1 text-xs text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
                      value={r.owner}
                      onChange={(e) => void updateAccountOwner(r.id, e.target.value)}
                      aria-label={`设置 ${r.name} 的统计口径`}
                      disabled={loading || ownersLoading}
                    >
                      {options.map((o) => (
                        <option key={o.id} value={o.name}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[#dbe5ff] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[#1f2a44]">归属人（用于下拉选择）</div>
        </div>

        {ownersError ? <div className="mt-2 text-sm text-red-600">{ownersError}</div> : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="w-full sm:w-[18rem] rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-3 py-2 text-sm text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
            value={newOwnerName}
            onChange={(e) => setNewOwnerName(e.target.value)}
            placeholder="新增归属人（如：我/姐姐/老婆）"
            disabled={ownersSaving}
          />
          <button
            type="button"
            disabled={ownersSaving || !newOwnerName.trim()}
            onClick={() => void addOwner()}
            className="rounded-md bg-[#1677ff] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-[#0e66e8]"
          >
            新增
          </button>
        </div>

        {ownersCrudError ? <div className="mt-2 text-sm text-red-600">{ownersCrudError}</div> : null}

        <div className="mt-3 space-y-2">
          {ownerOptions.length < 1 ? (
            <div className="text-sm text-[#8ea1c8]">暂无归属人</div>
          ) : (
            ownerOptions.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#e8efff] bg-[#fbfcff] px-3 py-2">
                <input
                  className="w-full sm:w-[16rem] rounded-md border border-[#dbe5ff] bg-white px-3 py-2 text-sm text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
                  defaultValue={o.name}
                  onBlur={(e) => void renameOwner(o.id, e.target.value)}
                  disabled={ownersSaving}
                />
                <button
                  type="button"
                  disabled={ownersSaving}
                  onClick={() => void deleteOwner(o.id, o.name)}
                  className="rounded-md border border-[#dbe5ff] bg-white px-3 py-2 text-xs font-medium text-[#5e6f95] hover:bg-[#f5f8ff]"
                >
                  删除
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

