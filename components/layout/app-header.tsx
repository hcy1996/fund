"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserNav } from "@/components/user-nav";
import { activeAccountStorageKey } from "@/lib/fundHomeStorage";
import {
  deleteFundSearchHistoryEntry,
  readFundSearchHistory,
  recordFundSearchHistory,
} from "@/lib/fundSearchHistory";

type FundSearchItem = {
  code: string;
  name: string;
  nav?: number;
  navDate?: string;
  hotCount?: number;
};

const LOCAL_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const HOT_WEIGHT = 0.7;
const LOCAL_WEIGHT = 0.3;

function fmtNav(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M9 3.5a5.5 5.5 0 104.22 9.22l3.18 3.18a.75.75 0 101.06-1.06l-3.18-3.18A5.5 5.5 0 009 3.5zm-4 5.5a4 4 0 118 0 4 4 0 01-8 0z"
        fill="currentColor"
        opacity={0.45}
      />
    </svg>
  );
}

function DeleteSmallIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M6.5 6.5L13.5 13.5M13.5 6.5L6.5 13.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AppHeader() {
  const router = useRouter();
  const { data: session } = useSession();
  const [nowText, setNowText] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<FundSearchItem[]>([]);
  const [historyHits, setHistoryHits] = useState<FundSearchItem[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchSeqRef = useRef(0);
  const SUGGESTION_LIMIT = 8;
  const blurTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const getStoredAccountId = useCallback(() => {
    const uid = session?.user?.id;
    if (!uid) return null;
    try {
      const raw = localStorage.getItem(activeAccountStorageKey(uid));
      return raw?.trim() || null;
    } catch {
      return null;
    }
  }, [session?.user?.id]);

  const scopeUserId = session?.user?.id ?? null;

  const fetchSuggestions = useCallback(async (keywordRaw: string) => {
    const keyword = keywordRaw.trim();
    if (!keyword) {
      fetchSeqRef.current += 1; // invalidate in-flight requests
      setSuggestions([]);
      setSuggesting(false);
      setError(null);
      return;
    }

    const seq = ++fetchSeqRef.current;
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch(`/api/funds/search?q=${encodeURIComponent(keyword)}`);
      if (!res.ok) {
        if (seq !== fetchSeqRef.current) return;
        setSuggestions([]);
        setError("搜索失败");
        return;
      }
      const data = (await res.json()) as FundSearchItem[];
      if (seq !== fetchSeqRef.current) return;
      const localEntries = readFundSearchHistory(scopeUserId);
      const localMap: Record<string, { count: number; lastAt: number }> = {};
      for (const it of localEntries) localMap[it.code] = { count: it.count, lastAt: it.lastAt };

      const now = Date.now();
      const ranked = data
        .map((item, index) => {
          const hotCount = item.hotCount ?? 0;
          const hotScore = Math.log1p(hotCount);

          const local = localMap[item.code];
          const localDecay = local ? Math.exp(-(now - local.lastAt) / LOCAL_HALF_LIFE_MS) : 0;
          const localScore = local ? Math.log1p(local.count) * localDecay : 0;

          const score = hotScore * HOT_WEIGHT + localScore * LOCAL_WEIGHT;
          return { item, index, score };
        })
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((x) => x.item);

      const limited = ranked.slice(0, SUGGESTION_LIMIT);
      setSuggestions(limited);
    } catch {
      if (seq !== fetchSeqRef.current) return;
      setSuggestions([]);
      setError("网络错误");
    } finally {
      if (seq !== fetchSeqRef.current) return;
      setSuggesting(false);
    }
  }, [scopeUserId]);

  const loadHistoryHits = useCallback(() => {
    const local = readFundSearchHistory(scopeUserId);
    const top = local.slice(0, 10).map((x) => ({
      code: x.code,
      name: x.name ?? "",
    }));
    setHistoryHits(top);
  }, [scopeUserId]);

  const navigateToSearch = useCallback(
    (fundCode: string, fundName?: string) => {
      // 记录：本地历史 + 服务端热点（只在登录态时生效）
      recordFundSearchHistory(scopeUserId, fundCode, fundName);
      void fetch("/api/funds/search/hit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundCode }),
      }).catch(() => undefined);

      const accountId = getStoredAccountId();
      const p = new URLSearchParams();
      if (accountId) p.set("accountId", accountId);

      const qs = p.toString();
      router.push(`/funds/${encodeURIComponent(fundCode)}${qs ? `?${qs}` : ""}`);
    },
    [getStoredAccountId, router, scopeUserId],
  );

  async function handleSubmit() {
    const q = query.trim();
    if (!q) {
      const firstHistory = historyHits[0];
      if (firstHistory) {
        navigateToSearch(firstHistory.code, firstHistory.name);
        return;
      }
      setSuggestions([]);
      setError("请输入基金代码或名称");
      return;
    }

    // 如果下拉框已有结果，Enter 必须严格跳转“当前下拉第一个”
    const firstCode = suggestions[0]?.code;
    const firstName = suggestions[0]?.name;
    if (typeof firstCode === "string" && firstCode.trim()) {
      navigateToSearch(firstCode, firstName);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // 下拉为空：立刻补一次请求，再取接口返回第一个
      const result = await fetch(`/api/funds/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          const rows = data as FundSearchItem[];
          return rows[0];
        })
        .catch(() => undefined);

      const codeToNavigate = result?.code;
      if (!codeToNavigate) {
        setError("未找到匹配基金");
        return;
      }
      navigateToSearch(codeToNavigate, result?.name);
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancelSearch() {
    setQuery("");
    setError(null);
    setSuggestions([]);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchSuggestions(query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fetchSuggestions, query]);

  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const tick = () => {
      const d = new Date();
      setNowText(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
      );
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-[#e2ebff] bg-white/90 shadow-[0_1px_0_0_rgba(22,119,255,0.04)] backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl w-full flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3">
        <Link
          href="/"
          className="group flex min-w-0 max-w-52 shrink-0 items-center gap-2.5 sm:max-w-none"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1677ff] to-[#4096ff] text-sm font-bold text-white shadow-md shadow-[#1677ff]/25 transition group-hover:shadow-lg group-hover:shadow-[#1677ff]/30">
            F
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold tracking-tight text-[#1f2a44]">
              Fund Estimator
            </span>
            <span className="hidden text-[11px] leading-none text-[#8ea1c8] sm:block">基金估值 · 持仓</span>
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center justify-end gap-3 sm:basis-auto sm:flex-nowrap">
          <div className="relative w-full max-w-[18rem] shrink-0 sm:max-w-[20rem]">
            <div className="relative flex flex-col gap-1.5">
              <div
                className={`flex min-h-11 items-stretch overflow-hidden rounded-2xl border bg-white transition-shadow ${
                error
                  ? "border-red-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
                  : "border-[#d4e3ff] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] focus-within:border-[#8cbbff] focus-within:shadow-[0_0_0_3px_rgba(22,119,255,0.12)]"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 pl-3">
                  <SearchIcon className="h-5 w-5 shrink-0 text-[#a8b8d8]" />
                  <input
                    ref={inputRef}
                    aria-label="基金代码或名称"
                    className="min-w-0 flex-1 border-0 bg-transparent py-2 pr-2 text-sm text-[#1f2a44] outline-none placeholder:text-[#b4c0db]"
                    value={query}
                    onFocus={() => {
                      if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
                      setIsFocused(true);
                      loadHistoryHits();
                    }}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSuggestions([]);
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSubmit();
                      }
                    }}
                    onBlur={() => {
                      blurTimerRef.current = window.setTimeout(() => {
                        setIsFocused(false);
                      }, 150);
                    }}
                    placeholder="输入基金代码/名称"
                  />
                  {suggesting && (
                    <span className="shrink-0 pr-1 text-[11px] text-[#8ea1c8]">搜索中…</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1 border-l border-[#eef3ff] bg-[#fafcff] px-1.5 py-1">
                  {query.trim() !== "" && (
                    <button
                      type="button"
                      onClick={handleCancelSearch}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-[#7b8fb7] transition hover:bg-white hover:text-[#4d5f87]"
                    >
                      清除
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={submitting || query.trim() === ""}
                    className="rounded-xl bg-[#1677ff] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0e66e8] disabled:opacity-50"
                  >
                    {submitting ? "…" : "查询"}
                  </button>
                </div>
              </div>

              {isFocused &&
                (query.trim() === ""
                  ? historyHits.length > 0
                  : suggestions.length > 0 || suggesting) && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-56 overflow-auto rounded-xl border border-[#e2ebff] bg-white py-1 shadow-xl shadow-[#1f2a44]/8">
                  {query.trim() === "" && historyHits.length > 0 && (
                    <div className="px-3 py-1 text-[11px] text-[#8ea1c8]">最近搜索</div>
                  )}
                  {query.trim() === "" &&
                    historyHits.map((item) => (
                    <button
                      key={`history-${item.code}`}
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setSuggestions([]);
                        setIsFocused(false);
                        setError(null);
                        inputRef.current?.blur(); // 防止下一次点击不触发 onFocus
                        navigateToSearch(item.code, item.name);
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs transition hover:bg-[#f5f9ff]"
                    >
                      <span className="truncate text-[#1f2a44]">
                        <span className="font-mono tabular-nums text-[#1677ff]">{item.code}</span>
                        {item.name ? <span className="ml-2 text-[#4d5f87]">{item.name}</span> : null}
                      </span>
                      <span className="flex shrink-0 items-center">
                        <span
                          role="button"
                          tabIndex={-1}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#8ea1c8] transition hover:bg-[#f5f9ff] hover:text-[#5e6f95]"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
                            blurTimerRef.current = null;
                            setIsFocused(true);
                            deleteFundSearchHistoryEntry(scopeUserId, item.code);
                            loadHistoryHits();
                            setIsFocused(true);
                            inputRef.current?.focus();
                          }}
                          aria-label={`删除 ${item.code} 的搜索记录`}
                          title="删除"
                        >
                          <DeleteSmallIcon />
                        </span>
                      </span>
                    </button>
                    ))}
                  {suggestions
                    .filter((it) => !historyHits.some((h) => h.code === it.code))
                    .map((item) => (
                      <button
                        key={`hit-${item.code}`}
                        type="button"
                        onClick={() => {
                          setQuery("");
                          setSuggestions([]);
                          setIsFocused(false);
                          setError(null);
                          inputRef.current?.blur(); // 防止下一次点击不触发 onFocus
                          navigateToSearch(item.code, item.name);
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs transition hover:bg-[#f5f9ff]"
                      >
                        <span className="truncate text-[#1f2a44]">
                          <span className="font-mono tabular-nums text-[#1677ff]">{item.code}</span>
                          {item.name ? <span className="ml-2 text-[#4d5f87]">{item.name}</span> : null}
                        </span>
                        <span className="shrink-0 tabular-nums text-[#8ea1c8]">
                          {item.nav !== undefined ? fmtNav(item.nav) : "—"}
                        </span>
                      </button>
                    ))}
                </div>
              )}
              {error && <p className="px-0.5 text-xs text-red-500">{error}</p>}
            </div>
          </div>
          <nav className="shrink-0">
            <div className="flex items-center gap-3">
              <span className="hidden text-[11px] text-[#8ea1c8] tabular-nums sm:inline">
                {nowText}
              </span>
              <UserNav />
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
