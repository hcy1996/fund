"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useState } from "react";
import { UserNav } from "@/components/user-nav";
import { activeAccountStorageKey } from "@/lib/fundHomeStorage";

type FundSearchItem = {
  code: string;
  name: string;
  nav?: number;
  navDate?: string;
};

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

export function AppHeader() {
  const router = useRouter();
  const { data: session } = useSession();
  const [code, setCode] = useState("");
  const [searchList, setSearchList] = useState<FundSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function searchFundsByKeyword(keyword: string) {
    setSearching(true);
    try {
      const res = await fetch(`/api/funds/search?q=${encodeURIComponent(keyword)}`);
      if (!res.ok) {
        setSearchList([]);
        return [];
      }
      const data = (await res.json()) as FundSearchItem[];
      setSearchList(data);
      return data;
    } catch {
      setSearchList([]);
      return [];
    } finally {
      setSearching(false);
    }
  }

  async function handleQuery() {
    const q = code.trim();
    if (!q) {
      setSearchList([]);
      setError("请输入基金代码或名称");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let exactCode: string | undefined;
      if (/^\d{6}$/.test(q)) {
        const result = await searchFundsByKeyword(q);
        exactCode = result.find((item) => item.code === q)?.code;
      } else {
        const result = await searchFundsByKeyword(q);
        exactCode = result[0]?.code;
      }
      if (!exactCode) {
        setError("未找到匹配基金");
        return;
      }
      setSearchList([]);
      const p = new URLSearchParams({ code: exactCode });
      const accountId = getStoredAccountId();
      if (accountId) p.set("accountId", accountId);
      router.push(`/search?${p.toString()}`);
    } finally {
      setLoading(false);
    }
  }

  function handleCancelSearch() {
    setCode("");
    setError(null);
    setSearchList([]);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[#e2ebff] bg-white/90 shadow-[0_1px_0_0_rgba(22,119,255,0.04)] backdrop-blur-md">
      <div className="mx-auto grid max-w-5xl w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-4 py-3 md:grid-cols-[auto_auto_auto] md:items-center md:gap-x-5">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-2.5 self-center md:max-w-[13rem]"
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

        <nav className="col-start-2 row-start-1 flex items-center justify-end md:col-start-3 md:justify-start">
          <UserNav />
        </nav>

        <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1">
          <div className="relative mx-auto flex w-full max-w-[18rem] flex-col gap-1.5 sm:max-w-[20rem] md:mx-0">
            <div
              className={`flex min-h-[2.75rem] items-stretch overflow-hidden rounded-2xl border bg-white transition-shadow ${
                error
                  ? "border-red-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
                  : "border-[#d4e3ff] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] focus-within:border-[#8cbbff] focus-within:shadow-[0_0_0_3px_rgba(22,119,255,0.12)]"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2 pl-3">
                <SearchIcon className="h-5 w-5 shrink-0 text-[#a8b8d8]" />
                <input
                  aria-label="基金代码或名称"
                  className="min-w-0 flex-1 border-0 bg-transparent py-2 pr-2 text-sm text-[#1f2a44] outline-none placeholder:text-[#b4c0db]"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setSearchList([]);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleQuery();
                    }
                  }}
                  placeholder="搜索基金代码或名称"
                />
                {searching && (
                  <span className="shrink-0 pr-1 text-[11px] text-[#8ea1c8]">搜索中…</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1 border-l border-[#eef3ff] bg-[#fafcff] px-1.5 py-1">
                {code.trim() !== "" && (
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
                  onClick={() => void handleQuery()}
                  disabled={loading}
                  className="rounded-xl bg-[#1677ff] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0e66e8] disabled:opacity-50"
                >
                  {loading ? "…" : "查询"}
                </button>
              </div>
            </div>

            {searchList.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-56 overflow-auto rounded-xl border border-[#e2ebff] bg-white py-1 shadow-xl shadow-[#1f2a44]/8">
                {searchList.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      setCode(item.code);
                      const p = new URLSearchParams({ code: item.code });
                      const accountId = getStoredAccountId();
                      if (accountId) p.set("accountId", accountId);
                      router.push(`/search?${p.toString()}`);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs transition hover:bg-[#f5f9ff]"
                  >
                    <span className="truncate text-[#1f2a44]">
                      <span className="font-mono tabular-nums text-[#1677ff]">{item.code}</span>{" "}
                      <span className="text-[#4d5f87]">{item.name}</span>
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
      </div>
    </header>
  );
}
