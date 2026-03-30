"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ScreenshotImportModal } from "@/components/home/screenshot-import-modal";
import { activeAccountStorageKey } from "@/lib/fundHomeStorage";
import { DEFAULT_WATCHLIST_GROUP_NAME } from "@/lib/watchlistConstants";
import type { HoldingWithProfit } from "@/types/holding";
import type { WatchlistGroupedDto, WatchlistGroupDto } from "@/types/watchlist";

type AccountItem = {
  id: string;
  name: string;
};

const FUND_HOME_TAB_STORAGE_KEY = "fund-home:activeTab";

function fmtMoney(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNav(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function fmtSignedPct(n: number | undefined) {
  if (n === undefined) return "—";
  return `${n >= 0 ? "+" : ""}${fmtPct(n)}`;
}

function fmtSignedMoney(n: number | undefined) {
  if (n === undefined) return "—";
  const raw = Math.abs(n).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n >= 0 ? "+" : "-"}${raw}`;
}

function HoldingBulkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className ?? "h-3.5 w-3.5"}
      fill="currentColor"
      aria-hidden
    >
      <path d="M2 2h5v2.5H2V2zm7 0h7v2.5H9V2zM2 6.25h5V8.75H2V6.25zm7 0h7V8.75H9V6.25zM2 10.5h5V13H2v-2.5zm7 0h5V13H9v-2.5z" />
    </svg>
  );
}

function GroupDeleteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className ?? "h-3 w-3"}
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function FundHome() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<"home" | "watchlist">("home");
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<HoldingWithProfit[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(true);
  const [draggingHoldingId, setDraggingHoldingId] = useState<string | null>(null);
  const [holdingActionLoading, setHoldingActionLoading] = useState(false);
  const [holdingBulkMode, setHoldingBulkMode] = useState(false);
  const [selectedHoldingIds, setSelectedHoldingIds] = useState<string[]>([]);
  const [holdingCtxMenu, setHoldingCtxMenu] = useState<{
    x: number;
    y: number;
    holdingId: string;
  } | null>(null);
  const [sortEditMode, setSortEditMode] = useState(false);

  const [watchlist, setWatchlist] = useState<WatchlistGroupedDto["groups"]>([]);
  const [activeWatchGroupId, setActiveWatchGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [groupSortEditMode, setGroupSortEditMode] = useState(false);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameGroupDraft, setRenameGroupDraft] = useState("");
  const [screenshotImportOpen, setScreenshotImportOpen] = useState(false);

  /** 供 loadAccounts 在异步流程中读取“上一选中账户”（避免仅用闭包 prev 不一致） */
  const activeAccountIdRef = useRef<string | null>(null);
  /** 忽略过期的持仓请求响应（并行请求竞态） */
  const holdingsFetchSeqRef = useRef(0);

  /** 持仓组合：今日累计收益、以昨日市值为分母的组合收益率 */
  const holdingsTodaySummary = useMemo(() => {
    if (holdings.length === 0) {
      return { totalDailyProfit: 0, todayReturnRate: 0 };
    }
    let totalDaily = 0;
    let prevDayTotal = 0;
    for (const h of holdings) {
      totalDaily += h.profit.dailyProfit;
      const r = h.dailyChangeRate ?? h.profit.dailyProfitRate ?? 0;
      const v = h.profit.estimateValue;
      if (Number.isFinite(v) && Number.isFinite(r) && r > -1) {
        prevDayTotal += v / (1 + r);
      } else if (Number.isFinite(v)) {
        prevDayTotal += v;
      }
    }
    const todayReturnRate = prevDayTotal > 0 ? totalDaily / prevDayTotal : 0;
    return { totalDailyProfit: totalDaily, todayReturnRate };
  }, [holdings]);

  const showEstimateSummaryBadge = useMemo(() => holdings.some((h) => h.navTag === "estimate"), [holdings]);

  const holdingCtxTargetRow = useMemo(() => {
    if (!holdingCtxMenu) return null;
    return holdings.find((h) => h.id === holdingCtxMenu.holdingId) ?? null;
  }, [holdingCtxMenu, holdings]);

  useEffect(() => {
    activeAccountIdRef.current = activeAccountId;
  }, [activeAccountId]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(FUND_HOME_TAB_STORAGE_KEY);
      if (v === "home" || v === "watchlist") {
        setActiveTab(v);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setFundHomeTab = useCallback((tab: "home" | "watchlist") => {
    setActiveTab(tab);
    try {
      localStorage.setItem(FUND_HOME_TAB_STORAGE_KEY, tab);
    } catch {
      /* ignore */
    }
  }, []);

  const loadHoldings = useCallback(async (forAccountId?: string | null) => {
    const id = forAccountId !== undefined ? forAccountId : activeAccountId;
    const seq = ++holdingsFetchSeqRef.current;
    setHoldingsLoading(true);
    try {
      const qs = id ? `?accountId=${encodeURIComponent(id)}` : "";
      const res = await fetch(`/api/holdings${qs}`);
      if (seq !== holdingsFetchSeqRef.current) return;
      if (res.ok) {
        const data = (await res.json()) as HoldingWithProfit[];
        setHoldings(data);
      } else {
        setHoldings([]);
      }
    } finally {
      if (seq === holdingsFetchSeqRef.current) {
        setHoldingsLoading(false);
      }
    }
  }, [activeAccountId]);

  const loadAccounts = useCallback(async (): Promise<string | null> => {
    if (!session?.user?.id) {
      setAccounts([]);
      setActiveAccountId(null);
      return null;
    }
    const userId = session.user.id;
    const res = await fetch("/api/accounts");
    if (!res.ok) {
      setAccounts([]);
      setActiveAccountId(null);
      return null;
    }
    const data = (await res.json()) as AccountItem[];
    setAccounts(data);

    let storedId: string | null = null;
    try {
      const raw =
        typeof window !== "undefined" ? localStorage.getItem(activeAccountStorageKey(userId)) : null;
      storedId = raw?.trim() || null;
    } catch {
      storedId = null;
    }

    let nextId: string | null = null;
    if (storedId && data.some((a) => a.id === storedId)) {
      nextId = storedId;
    } else if (storedId) {
      try {
        localStorage.removeItem(activeAccountStorageKey(userId));
      } catch {
        /* ignore */
      }
    }
    if (nextId === null) {
      const prev = activeAccountIdRef.current;
      if (prev && data.some((a) => a.id === prev)) nextId = prev;
    }
    if (nextId === null) nextId = data[0]?.id ?? null;

    setActiveAccountId(nextId);
    return nextId;
  }, [session?.user?.id]);

  const selectAccount = useCallback(
    (accountId: string) => {
      setActiveAccountId(accountId);
      const uid = session?.user?.id;
      if (!uid) return;
      try {
        localStorage.setItem(activeAccountStorageKey(uid), accountId);
      } catch {
        /* ignore quota */
      }
    },
    [session?.user?.id],
  );

  const handleCreateAccount = useCallback(async () => {
    if (!session?.user?.id) return;
    const name = prompt("请输入账户名称（例如 券商1）：", "");
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      alert("账户名称不能为空");
      return;
    }
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) {
      alert("创建账户失败");
      return;
    }
    await loadAccounts();
  }, [session?.user?.id, loadAccounts]);

  const handleDeleteAccount = useCallback(
    async (account: AccountItem) => {
      if (!session?.user?.id) return;
      if (!confirm(`确认删除账户「${account.name}」？该账户需先清空持仓。`)) return;
      const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error || "删除账户失败");
        return;
      }
      await loadAccounts();
    },
    [session?.user?.id, loadAccounts],
  );

  const loadWatchlist = useCallback(async () => {
    setWatchlistLoading(true);
    try {
      const itemRes = await fetch("/api/watchlists/items");
      if (itemRes.ok) {
        const w = (await itemRes.json()) as WatchlistGroupedDto;
        setWatchlist(w.groups);
        setActiveWatchGroupId((prev) =>
          w.groups.length === 0 ? "" : prev && w.groups.some((g) => g.id === prev) ? prev : w.groups[0].id,
        );
      } else {
        setWatchlist([]);
        setActiveWatchGroupId("");
      }
    } finally {
      setWatchlistLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      void loadAccounts();
      void loadWatchlist();
    } else {
      holdingsFetchSeqRef.current += 1;
      setHoldings([]);
      setAccounts([]);
      setActiveAccountId(null);
      setWatchlist([]);
      setActiveWatchGroupId("");
      setHoldingsLoading(false);
      setWatchlistLoading(false);
      setHoldingBulkMode(false);
      setSelectedHoldingIds([]);
      setHoldingCtxMenu(null);
    }
  }, [session?.user?.id, loadAccounts, loadWatchlist]);

  /** 当前选中账户就绪后再拉持仓，避免与 loadAccounts 并行时用 null 误拉默认账户或被旧请求覆盖 */
  useEffect(() => {
    if (!session?.user?.id) return;
    if (activeAccountId == null) {
      setHoldings([]);
      return;
    }
    void loadHoldings(activeAccountId);
  }, [session?.user?.id, activeAccountId, loadHoldings]);

  useEffect(() => {
    setSelectedHoldingIds([]);
  }, [activeAccountId]);

  useEffect(() => {
    if (!holdingCtxMenu) return;
    const close = () => setHoldingCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [holdingCtxMenu]);

  async function saveRenameGroup(groupId: string) {
    const name = renameGroupDraft.trim();
    if (!name) {
      alert("分组名不能为空");
      return;
    }
    const res = await fetch(`/api/watchlists/groups/${groupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      alert(typeof j.error === "string" ? j.error : "改名失败");
      return;
    }
    setRenamingGroupId(null);
    setRenameGroupDraft("");
    await loadWatchlist();
  }

  async function createGroup() {
    const name = groupName.trim();
    if (!name) return;
    const res = await fetch("/api/watchlists/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      alert("创建分组失败");
      return;
    }
    const created = (await res.json()) as WatchlistGroupDto;
    setGroupName("");
    await loadWatchlist();
    setActiveWatchGroupId(created.id);
  }

  async function removeFromGroup(itemId: string, groupId: string) {
    const res = await fetch("/api/watchlists/items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, groupId }),
    });
    if (res.ok) {
      await loadWatchlist();
    }
  }

  async function removeWatchlistItemEntirely(itemId: string) {
    if (!confirm("确认从全部自选分组中移除该基金？")) return;
    const res = await fetch(`/api/watchlists/items/${itemId}`, { method: "DELETE" });
    if (!res.ok) {
      alert("移除失败");
      return;
    }
    await loadWatchlist();
  }

  async function deleteGroup(groupId: string) {
    const target = watchlist.find((g) => g.id === groupId);
    if (!target || target.name === DEFAULT_WATCHLIST_GROUP_NAME) return;
    if (!confirm(`确认删除分组「${target.name}」？`)) return;
    const res = await fetch(`/api/watchlists/groups/${groupId}`, { method: "DELETE" });
    if (!res.ok) {
      alert("删除分组失败");
      return;
    }
    await loadWatchlist();
  }

  async function persistGroupOrder(next: WatchlistGroupedDto["groups"]) {
    const ids = next.map((g) => g.id);
    const res = await fetch("/api/watchlists/groups/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      alert("保存分组排序失败");
      await loadWatchlist();
    }
  }

  function moveGroup(dragId: string, targetId: string) {
    if (dragId === targetId) return;
    const def = watchlist.find((g) => g.name === DEFAULT_WATCHLIST_GROUP_NAME);
    if (def) {
      if (dragId === def.id || targetId === def.id) return;
      setWatchlist((prev) => {
        const d = prev.find((g) => g.name === DEFAULT_WATCHLIST_GROUP_NAME);
        if (!d) return prev;
        const others = prev.filter((g) => g.id !== d.id);
        const from = others.findIndex((g) => g.id === dragId);
        const to = others.findIndex((g) => g.id === targetId);
        if (from === -1 || to === -1) return prev;
        const nextOthers = [...others];
        const [item] = nextOthers.splice(from, 1);
        nextOthers.splice(to, 0, item);
        const nextList = [d, ...nextOthers];
        void persistGroupOrder(nextList);
        return nextList;
      });
    } else {
      setWatchlist((prev) => {
        const from = prev.findIndex((g) => g.id === dragId);
        const to = prev.findIndex((g) => g.id === targetId);
        if (from === -1 || to === -1) return prev;
        const next = [...prev];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        void persistGroupOrder(next);
        return next;
      });
    }
  }

  async function deleteHolding(holdingId: string) {
    if (!confirm("确认删除该持仓？")) {
      return;
    }
    const res = await fetch(`/api/holdings/${holdingId}`, { method: "DELETE" });
    if (!res.ok) {
      alert("删除失败");
      return;
    }
    await loadHoldings();
  }

  async function moveHoldingToAccount(holdingId: string, targetAccountId: string) {
    if (!activeAccountId || targetAccountId === activeAccountId) return;
    setHoldingActionLoading(true);
    try {
      const res = await fetch(`/api/holdings/${holdingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: targetAccountId }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) {
        const msg =
          typeof j.error === "string" ? j.error : res.status === 409 ? "目标账户已有该基金" : "移动失败";
        alert(msg);
        return;
      }
      await loadHoldings();
    } finally {
      setHoldingActionLoading(false);
    }
  }

  function toggleHoldingBulkMode() {
    setHoldingBulkMode((prev) => {
      if (prev) setSelectedHoldingIds([]);
      return !prev;
    });
  }

  function exitHoldingBulkMode() {
    setSelectedHoldingIds([]);
    setHoldingBulkMode(false);
  }

  function toggleHoldingSelected(id: string) {
    setSelectedHoldingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAllHoldings() {
    setSelectedHoldingIds((prev) =>
      prev.length === holdings.length ? [] : holdings.map((h) => h.id),
    );
  }

  async function batchDeleteSelectedHoldings() {
    const ids = selectedHoldingIds.filter((id) => holdings.some((h) => h.id === id));
    if (ids.length === 0) return;
    if (!confirm(`确认删除已选的 ${ids.length} 条持仓？`)) return;
    setHoldingActionLoading(true);
    try {
      for (const id of ids) {
        const res = await fetch(`/api/holdings/${id}`, { method: "DELETE" });
        if (!res.ok) {
          alert("部分删除失败");
          break;
        }
      }
      setSelectedHoldingIds([]);
      await loadHoldings();
    } finally {
      setHoldingActionLoading(false);
    }
  }

  async function batchMoveSelectedToAccount(targetAccountId: string) {
    if (!activeAccountId || targetAccountId === activeAccountId) return;
    const ids = selectedHoldingIds.filter((id) => holdings.some((h) => h.id === id));
    if (ids.length === 0) return;
    setHoldingActionLoading(true);
    let fail = 0;
    try {
      for (const id of ids) {
        const res = await fetch(`/api/holdings/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: targetAccountId }),
        });
        if (!res.ok) fail++;
      }
      setSelectedHoldingIds([]);
      await loadHoldings();
      if (fail > 0) {
        alert(`${fail} 条未成功（可能目标账户已有同基金）`);
      }
    } finally {
      setHoldingActionLoading(false);
    }
  }

  async function persistHoldingOrder(next: HoldingWithProfit[]) {
    const ids = next.map((x) => x.id);
    const res = await fetch("/api/holdings/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      alert("保存排序失败");
      await loadHoldings();
    }
  }

  function moveHolding(dragId: string, targetId: string) {
    if (dragId === targetId) return;
    setHoldings((prev) => {
      const from = prev.findIndex((x) => x.id === dragId);
      const to = prev.findIndex((x) => x.id === targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      void persistHoldingOrder(next);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-[#dbe5ff] bg-white p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => setFundHomeTab("home")}
            className={`rounded-md px-2.5 py-1 text-sm font-medium ${
              activeTab === "home" ? "bg-[#1677ff] text-white" : "text-[#4d5f87]"
            }`}
          >
            首页
          </button>
          <button
            type="button"
            onClick={() => setFundHomeTab("watchlist")}
            className={`rounded-md px-2.5 py-1 text-sm font-medium ${
              activeTab === "watchlist" ? "bg-[#1677ff] text-white" : "text-[#4d5f87]"
            }`}
          >
            自选
          </button>
        </div>
        {activeTab === "home" && session?.user && (
          <button
            type="button"
            onClick={() => setScreenshotImportOpen(true)}
            className="rounded-md border border-[#dbe5ff] bg-white px-3 py-1 text-sm font-medium text-[#5e6f95] hover:bg-[#f5f8ff]"
          >
            截图导入
          </button>
        )}
      </div>

      {activeTab === "home" && (
        <>
          <section className="rounded-lg border border-[#dbe5ff] bg-white p-2 shadow-sm">
            <div className="mb-1.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-sm font-semibold text-[#1f2a44]">持仓</h3>
                {session?.user && accounts.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {accounts.map((acc) => (
                      <div key={acc.id} className="group relative flex items-center">
                        <button
                          type="button"
                          onClick={() => selectAccount(acc.id)}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                            acc.id === activeAccountId
                              ? "border-[#1677ff] bg-[#eaf4ff] text-[#1677ff]"
                              : "border-[#dbe5ff] bg-white text-[#5e6f95]"
                          }`}
                        >
                          {acc.name}
                        </button>
                        {acc.name !== "我的" && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteAccount(acc)}
                            className="absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[10px] text-[#9aa9c7] opacity-0 shadow group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
                            title={`删除账户「${acc.name}」`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => void handleCreateAccount()}
                      className="ml-0.5 rounded-full border border-dashed border-[#dbe5ff] px-1.5 py-0.5 text-[10px] text-[#1677ff] hover:border-[#1677ff]"
                    >
                      +账户
                    </button>
                  </div>
                )}
              </div>
              {session?.user && !holdingsLoading && holdings.length > 0 && (
                <div className="flex shrink-0 flex-wrap items-end justify-end gap-x-4 [font-variant-numeric:tabular-nums]">
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <p className="text-[10px] font-medium text-[#7b8fb7]">今日收益</p>
                      {showEstimateSummaryBadge && (
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#fff3e0] text-[#d97706] text-[10px] font-semibold">
                          估
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-0.5 text-sm font-semibold leading-none ${
                        holdingsTodaySummary.totalDailyProfit >= 0 ? "text-[#ff5f6d]" : "text-[#00d26a]"
                      }`}
                    >
                      {fmtSignedMoney(holdingsTodaySummary.totalDailyProfit)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <p className="text-[10px] font-medium text-[#7b8fb7]">今日涨跌</p>
                      {showEstimateSummaryBadge && (
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#fff3e0] text-[#d97706] text-[10px] font-semibold">
                          估
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-0.5 text-sm font-semibold leading-none ${
                        holdingsTodaySummary.todayReturnRate >= 0 ? "text-[#ff5f6d]" : "text-[#00d26a]"
                      }`}
                    >
                      {fmtSignedPct(holdingsTodaySummary.todayReturnRate)}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {!session?.user ? (
              <p className="text-xs text-[#6a7ea8]">登录后查看</p>
            ) : holdingsLoading ? (
              <p className="text-xs text-[#6a7ea8]">加载中…</p>
            ) : holdings.length === 0 ? (
              <p className="text-xs text-[#6a7ea8]">暂无持仓</p>
            ) : (
              <div className="space-y-1.5">
                {holdingBulkMode && session?.user && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#dbe5ff] bg-[#f5f8ff] px-2 py-1.5 text-[11px] text-[#4d5f87]">
                    {selectedHoldingIds.length > 0 ? (
                      <span className="font-medium">已选 {selectedHoldingIds.length} 条</span>
                    ) : (
                      <span className="text-[#8ea1c8]">勾选下方持仓后可删除或移动</span>
                    )}
                    {selectedHoldingIds.length > 0 && (
                      <>
                        <button
                          type="button"
                          disabled={holdingActionLoading}
                          onClick={() => void batchDeleteSelectedHoldings()}
                          className="rounded border border-[#ffd7dc] bg-white px-2 py-0.5 text-red-600 hover:bg-[#fff5f5] disabled:opacity-50"
                        >
                          删除选中
                        </button>
                        {accounts.length > 1 && activeAccountId && (
                          <select
                            aria-label="将选中持仓移动到账户"
                            disabled={holdingActionLoading}
                            className="max-w-[7rem] rounded border border-[#dbe5ff] bg-white py-0.5 pl-1 text-[11px] text-[#5e6f95] disabled:opacity-50"
                            value=""
                            onChange={(e) => {
                              const to = e.target.value;
                              if (to) void batchMoveSelectedToAccount(to);
                            }}
                          >
                            <option value="">移动到…</option>
                            {accounts
                              .filter((a) => a.id !== activeAccountId)
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      disabled={holdingActionLoading}
                      onClick={exitHoldingBulkMode}
                      className="ml-auto rounded border border-[#dbe5ff] bg-white px-2 py-0.5 text-[#5e6f95] hover:bg-[#eef3ff] disabled:opacity-50"
                    >
                      取消
                    </button>
                  </div>
                )}
                <div
                  className={`grid items-center gap-1.5 rounded-md border border-[#e4ecff] bg-[#f5f8ff] px-2 py-1.5 ${
                    holdingBulkMode && session?.user
                      ? "grid-cols-[1.25rem_1.55fr_0.9fr_0.95fr_0.95fr]"
                      : "grid-cols-[1.55fr_0.9fr_0.95fr_0.95fr]"
                  }`}
                >
                  {holdingBulkMode && session?.user && (
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-[#1677ff]"
                        checked={selectedHoldingIds.length === holdings.length && holdings.length > 0}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              selectedHoldingIds.length > 0 &&
                              selectedHoldingIds.length < holdings.length;
                          }
                        }}
                        onChange={() => toggleSelectAllHoldings()}
                        title="全选"
                        aria-label="全选持仓"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-[11px] font-medium text-[#7b8fb7]">
                    基金
                    {session?.user && (
                      <button
                        type="button"
                        onClick={() => toggleHoldingBulkMode()}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded border ${
                          holdingBulkMode
                            ? "border-[#1677ff] bg-[#eaf4ff] text-[#1677ff]"
                            : "border-[#d3def7] bg-white text-[#8ea1c8]"
                        }`}
                        title={holdingBulkMode ? "关闭批量操作" : "批量操作（多选、删除、移动）"}
                        aria-label={holdingBulkMode ? "关闭批量操作" : "批量操作"}
                      >
                        <HoldingBulkIcon />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSortEditMode((v) => !v)}
                      className={`inline-flex h-5 w-5 items-center justify-center rounded border ${
                        sortEditMode
                          ? "border-[#1677ff] bg-[#eaf4ff] text-[#1677ff]"
                          : "border-[#d3def7] bg-white text-[#8ea1c8]"
                      }`}
                      title={sortEditMode ? "关闭排序模式" : "开启排序模式"}
                      aria-label={sortEditMode ? "关闭排序模式" : "开启排序模式"}
                    >
                      ⚙
                    </button>
                  </div>
                  <div className="pr-1 text-right">
                    <p className="text-[11px] font-medium text-[#5e6f95]">涨跌</p>
                    <p className="text-[10px] text-[#9baccb]">{holdings[0]?.navDate ?? "—"}</p>
                  </div>
                  <div className="pr-1 text-right">
                    <p className="text-[11px] font-medium leading-tight text-[#5e6f95]">当日收益</p>
                    <p className="text-[10px] text-[#9baccb]">{holdings[0]?.navDate ?? "—"}</p>
                  </div>
                  <div className="pr-1 text-right">
                    <p className="text-[11px] font-medium leading-tight text-[#5e6f95]">持有收益</p>
                    <p className="text-[10px] text-[#9baccb]">{holdings[0]?.navDate ?? "—"}</p>
                  </div>
                </div>
                {holdings.map((h) => (
                  <div
                    key={h.id}
                    className={`group relative grid items-center gap-1.5 rounded-md border border-[#e8efff] bg-white px-2 py-2 [font-variant-numeric:tabular-nums] ${
                      holdingBulkMode && session?.user
                        ? "grid-cols-[1.25rem_1.55fr_0.9fr_0.95fr_0.95fr]"
                        : "grid-cols-[1.55fr_0.9fr_0.95fr_0.95fr]"
                    }`}
                    draggable={sortEditMode}
                    onDragStart={() => {
                      if (!sortEditMode) return;
                      setDraggingHoldingId(h.id);
                    }}
                    onDragEnd={() => setDraggingHoldingId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (sortEditMode && draggingHoldingId) {
                        moveHolding(draggingHoldingId, h.id);
                      }
                    }}
                    onContextMenuCapture={(e) => {
                      if (!session?.user) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setHoldingCtxMenu({ x: e.clientX, y: e.clientY, holdingId: h.id });
                    }}
                  >
                    {holdingBulkMode && session?.user && (
                      <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[#1677ff]"
                          checked={selectedHoldingIds.includes(h.id)}
                          onChange={() => toggleHoldingSelected(h.id)}
                          aria-label={`选择 ${h.fundName}`}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void deleteHolding(h.id)}
                      aria-label={`删除${h.fundName}持仓`}
                      className="absolute -right-1 -top-1 z-10 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-[#ffd7dc] bg-white text-[11px] leading-none text-[#9aa9c7] opacity-0 transition hover:bg-[#ffeef0] hover:text-red-500 group-hover:opacity-100 focus:opacity-100 focus:outline-none"
                      title="删除持仓"
                    >
                      ✕
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {sortEditMode && <span className="text-xs text-[#8ea1c8]">☰</span>}
                        <Link
                          href={`/funds/${encodeURIComponent(h.fundCode)}`}
                          className="block truncate text-[13px] font-medium leading-snug text-[#1f2a44] hover:text-[#1677ff]"
                        >
                          {h.fundName}
                        </Link>
                        <span className="shrink-0 text-xs text-[#9baccb]">{h.fundCode}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <p className="text-xs text-[#6a7ea8]">¥ {fmtMoney(h.profit.navValue)}</p>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            h.navTag === "estimate"
                              ? "bg-[#fff3e0] text-[#d97706]"
                              : "bg-[#eaf4ff] text-[#1677ff]"
                          }`}
                        >
                          {h.navTag === "estimate" ? "估算" : "已更新"}
                        </span>
                      </div>
                    </div>
                    <div className="pr-1 text-right">
                      <p
                        className={`text-sm font-semibold ${
                          (h.dailyChangeRate ?? 0) >= 0 ? "text-[#ff5f6d]" : "text-[#00d26a]"
                        }`}
                      >
                        {fmtSignedPct(h.dailyChangeRate)}
                      </p>
                      <p className="text-xs text-[#8ea1c8]">{h.nav !== undefined ? fmtNav(h.nav) : "—"}</p>
                    </div>
                    <div className="pr-1 text-right">
                      <p
                        className={`text-sm font-semibold ${
                          h.profit.dailyProfit >= 0 ? "text-[#ff5f6d]" : "text-[#00d26a]"
                        }`}
                      >
                        {fmtSignedMoney(h.profit.dailyProfit)}
                      </p>
                      <p className="text-xs text-[#8ea1c8]">{h.navDate ?? "—"}</p>
                    </div>
                    <div className="pr-1 text-right">
                      <p
                        className={`text-sm font-semibold ${
                          (h.profit.totalProfit ?? 0) >= 0 ? "text-[#ff5f6d]" : "text-[#00d26a]"
                        }`}
                      >
                        {fmtSignedMoney(h.profit.totalProfit)}
                      </p>
                      <p
                        className={`text-xs ${
                          (h.profit.totalProfitRate ?? 0) >= 0 ? "text-[#ff7d88]" : "text-[#53e18f]"
                        }`}
                      >
                        {h.profit.totalProfitRate !== undefined
                          ? `${h.profit.totalProfitRate >= 0 ? "+" : ""}${fmtPct(h.profit.totalProfitRate)}`
                          : "—"}
                      </p>
                    </div>
                  </div>
                ))}
                {holdingCtxMenu && holdingCtxTargetRow && session?.user && (
                  <div
                    className="fixed z-[100] min-w-[10rem] rounded-lg border border-[#dbe5ff] bg-white py-1 text-xs shadow-lg"
                    style={{
                      left: Math.min(holdingCtxMenu.x, typeof window !== "undefined" ? window.innerWidth - 168 : holdingCtxMenu.x),
                      top: Math.min(holdingCtxMenu.y, typeof window !== "undefined" ? window.innerHeight - 120 : holdingCtxMenu.y),
                    }}
                    role="menu"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      className="max-w-[14rem] truncate px-2 py-1 text-[10px] text-[#8ea1c8]"
                      title={holdingCtxTargetRow.fundName}
                    >
                      {holdingCtxTargetRow.fundName}
                    </div>
                    {accounts.length > 1 &&
                      activeAccountId &&
                      accounts.some((a) => a.id !== activeAccountId) && (
                        <div className="border-t border-[#edf2ff] pt-1">
                          <p className="px-2 pb-0.5 text-[10px] text-[#8ea1c8]">移动到</p>
                          {accounts
                            .filter((a) => a.id !== activeAccountId)
                            .map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                role="menuitem"
                                disabled={holdingActionLoading}
                                className="flex w-full px-2 py-1.5 text-left text-[#1f2a44] hover:bg-[#f5f8ff] disabled:opacity-50"
                                onClick={() => {
                                  setHoldingCtxMenu(null);
                                  void moveHoldingToAccount(holdingCtxTargetRow.id, a.id);
                                }}
                              >
                                {a.name}
                              </button>
                            ))}
                        </div>
                      )}
                    <button
                      type="button"
                      role="menuitem"
                      className="mt-0.5 w-full border-t border-[#edf2ff] px-2 py-1.5 text-left text-red-600 hover:bg-[#fff5f5] disabled:opacity-50"
                      disabled={holdingActionLoading}
                      onClick={() => {
                        setHoldingCtxMenu(null);
                        void deleteHolding(holdingCtxTargetRow.id);
                      }}
                    >
                      删除持仓
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === "watchlist" && (
        <section className="rounded-lg border border-[#dbe5ff] bg-white p-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <h3 className="text-sm font-semibold text-[#1f2a44]">自选</h3>
              <button
                type="button"
                onClick={() => setGroupSortEditMode((v) => !v)}
                className={`inline-flex h-5 w-5 items-center justify-center rounded border text-xs ${
                  groupSortEditMode
                    ? "border-[#1677ff] bg-[#eaf4ff] text-[#1677ff]"
                    : "border-[#d3def7] bg-white text-[#8ea1c8]"
                }`}
                title={groupSortEditMode ? "关闭分组排序" : "调整分组顺序"}
                aria-label={groupSortEditMode ? "关闭分组排序" : "调整分组顺序"}
              >
                ⚙
              </button>
              {groupSortEditMode && (
                <span className="text-[10px] text-[#1677ff]">拖动</span>
              )}
            </div>
          </div>
          {!session?.user ? (
            <p className="mt-2 text-xs text-[#6a7ea8]">请登录</p>
          ) : (
            <>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void createGroup();
                    }
                  }}
                  placeholder="分组名"
                  className="flex-1 rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2 py-1 text-sm text-[#1f2a44]"
                />
                <button
                  type="button"
                  onClick={() => void createGroup()}
                  className="rounded-md bg-[#1677ff] px-2.5 py-1 text-sm font-medium text-white hover:bg-[#0e66e8]"
                >
                  新建
                </button>
              </div>

              {watchlistLoading ? (
                <p className="mt-2 text-xs text-[#6a7ea8]">加载中…</p>
              ) : watchlist.length === 0 ? (
                <p className="mt-2 text-xs text-[#6a7ea8]">暂无分组</p>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {watchlist.map((g) => {
                      const isDefault = g.name === DEFAULT_WATCHLIST_GROUP_NAME;
                      return (
                        <div
                          key={g.id}
                          className="group/chip relative inline-flex"
                          draggable={groupSortEditMode && !isDefault}
                          onDragStart={() => {
                            if (!groupSortEditMode || isDefault) return;
                            setDraggingGroupId(g.id);
                          }}
                          onDragEnd={() => setDraggingGroupId(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (groupSortEditMode && draggingGroupId) {
                              moveGroup(draggingGroupId, g.id);
                            }
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveWatchGroupId(g.id)}
                            className={`rounded-md px-2.5 py-1 text-xs ${
                              activeWatchGroupId === g.id
                                ? "bg-[#1677ff] text-white"
                                : "border border-[#dbe5ff] bg-white text-[#5e6f95] hover:bg-[#f5f8ff]"
                            }`}
                          >
                            {groupSortEditMode && !isDefault && (
                              <span className="mr-0.5 text-[#8ea1c8]">☰</span>
                            )}
                            {g.name}
                          </button>
                          {!isDefault && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void deleteGroup(g.id);
                              }}
                              className="absolute -right-1 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-[#ffd7dc] bg-white text-[#9aa9c7] opacity-0 shadow-sm transition group-hover/chip:opacity-100 hover:bg-[#ffeef0] hover:text-red-500 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677ff]/40"
                              title={`删除分组「${g.name}」`}
                              aria-label={`删除分组 ${g.name}`}
                            >
                              <GroupDeleteIcon className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {watchlist
                    .filter((g) => g.id === activeWatchGroupId)
                    .map((g) => {
                      const isAllGroup = g.name === DEFAULT_WATCHLIST_GROUP_NAME;
                      return (
                      <div key={g.id} className="mt-1 rounded-md border border-[#e8efff] bg-[#f9fbff] px-2 py-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {renamingGroupId === g.id && !isAllGroup ? (
                              <div className="flex flex-wrap items-center gap-1">
                                <input
                                  value={renameGroupDraft}
                                  onChange={(e) => setRenameGroupDraft(e.target.value)}
                                  className="min-w-0 flex-1 rounded border border-[#dbe5ff] bg-white px-2 py-0.5 text-sm text-[#1f2a44]"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void saveRenameGroup(g.id);
                                    }
                                    if (e.key === "Escape") {
                                      setRenamingGroupId(null);
                                    }
                                  }}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => void saveRenameGroup(g.id)}
                                  className="rounded border border-[#1677ff] bg-[#eaf4ff] px-2 py-0.5 text-[11px] text-[#1677ff]"
                                >
                                  保存
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRenamingGroupId(null)}
                                  className="text-[11px] text-[#6a7ea8] hover:underline"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <>
                                <p className="text-sm font-medium leading-tight text-[#1f2a44]">{g.name}</p>
                                {g.name === DEFAULT_WATCHLIST_GROUP_NAME && (
                                  <p className="mt-0.5 text-[10px] text-[#8ea1c8]">汇总全部自选</p>
                                )}
                              </>
                            )}
                          </div>
                          {!isAllGroup && renamingGroupId !== g.id && (
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingGroupId(g.id);
                                setRenameGroupDraft(g.name);
                              }}
                              className="shrink-0 text-[11px] text-[#1677ff] hover:underline"
                            >
                              改名
                            </button>
                          )}
                        </div>
                        {g.items.length === 0 ? (
                          <p className="mt-1 text-xs text-[#8ea1c8]">空</p>
                        ) : (
                          <div className="mt-1 space-y-1">
                            {g.items.map((item) => (
                              <div
                                key={g.name === DEFAULT_WATCHLIST_GROUP_NAME ? item.id : `${g.id}-${item.id}`}
                                className="group/row relative flex flex-wrap items-center justify-between rounded-md border border-[#e8efff] bg-white px-2 py-0.5"
                              >
                                <Link
                                  href={`/funds/${encodeURIComponent(item.fundCode)}`}
                                  className="group min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1677ff]/40"
                                >
                                  <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                                    <span className="truncate text-sm font-medium text-[#1f2a44] group-hover:text-[#1677ff]">
                                      {item.fundName}
                                    </span>
                                    <span className="shrink-0 text-xs text-[#8ea1c8]">{item.fundCode}</span>
                                    {g.name === DEFAULT_WATCHLIST_GROUP_NAME &&
                                      item.groupLabels &&
                                      item.groupLabels.length > 0 &&
                                      item.groupLabels.map((label) => (
                                        <span
                                          key={label}
                                          className="shrink-0 rounded border border-[#c7ddff] bg-[#eaf4ff] px-1.5 py-0.5 text-[10px] text-[#1677ff]"
                                        >
                                          {label}
                                        </span>
                                      ))}
                                  </div>
                                  <p className="mt-0.5 text-[11px] text-[#6a7ea8]">
                                    {item.quote?.estimateNav ?? item.quote?.nav ?? "—"} ·{" "}
                                    {item.quote?.estimateChangeRate !== undefined
                                      ? fmtPct(item.quote.estimateChangeRate)
                                      : "—"}
                                  </p>
                                </Link>
                                {g.name === DEFAULT_WATCHLIST_GROUP_NAME ? (
                                  <button
                                    type="button"
                                    onClick={() => void removeWatchlistItemEntirely(item.id)}
                                    className="shrink-0 text-[11px] text-red-500 hover:underline"
                                  >
                                    删除
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void removeFromGroup(item.id, g.id)}
                                    title="从本分组删除；若未加入其他分组，将从「全部」移除"
                                    className="shrink-0 text-[11px] text-red-500 hover:underline"
                                  >
                                    删除
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      );
                    })}
                </>
              )}
            </>
          )}
        </section>
      )}

      <ScreenshotImportModal
        open={screenshotImportOpen}
        onClose={() => setScreenshotImportOpen(false)}
        onImported={() => void loadHoldings()}
        defaultAccountId={activeAccountId}
      />
    </div>
  );
}
