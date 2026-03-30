"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { WatchlistGroupDrawer } from "@/components/watchlist/watchlist-group-drawer";
import { calculateFundProfit } from "@/lib/calculate";
import type { FundQuote } from "@/types/fund";

function fmtMoney(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNav(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function FundQueryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const codeParam = searchParams.get("code")?.trim() ?? "";
  const accountIdParam = searchParams.get("accountId")?.trim() ?? "";

  const [quote, setQuote] = useState<FundQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shares, setShares] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  /** 持仓当前所在账户（用于跨账户移动提示） */
  const [holdingSourceAccountId, setHoldingSourceAccountId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [accountId, setAccountId] = useState("");

  const loadQuote = useCallback(async (targetCode: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/funds/quote?code=${encodeURIComponent(targetCode)}`);
      if (!res.ok) {
        throw new Error("查询失败");
      }
      const data = (await res.json()) as FundQuote;
      const hasValidNav =
        typeof data.nav === "number" ||
        typeof data.officialNav === "number" ||
        typeof data.estimateNav === "number";
      const hasValidName = typeof data.fundName === "string" && data.fundName.trim().length > 0;
      if (!hasValidName || !hasValidNav) {
        setQuote(null);
        setError("未找到匹配基金");
        return;
      }
      setQuote(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!codeParam) {
      setQuote(null);
      setError(null);
      setHoldingId(null);
      setShares("");
      setCostPrice("");
      return;
    }
    void loadQuote(codeParam);
  }, [codeParam, loadQuote]);

  useEffect(() => {
    async function loadAccounts() {
      if (!session?.user) {
        setAccounts([]);
        setAccountId("");
        return;
      }
      try {
        const res = await fetch("/api/accounts");
        if (!res.ok) return;
        const rows = (await res.json()) as Array<{ id: string; name: string }>;
        setAccounts(rows);
        setAccountId((prev) => {
          if (prev && rows.some((x) => x.id === prev)) return prev;
          if (accountIdParam && rows.some((x) => x.id === accountIdParam)) return accountIdParam;
          return rows[0]?.id ?? "";
        });
      } catch {
        // ignore
      }
    }
    void loadAccounts();
  }, [session?.user, accountIdParam]);

  useEffect(() => {
    async function loadHoldingAcrossAccounts() {
      if (!session?.user || !quote?.fundCode) {
        setHoldingId(null);
        setHoldingSourceAccountId(null);
        setShares("");
        setCostPrice("");
        return;
      }
      try {
        const res = await fetch(
          `/api/holdings/lookup?fundCode=${encodeURIComponent(quote.fundCode)}`,
        );
        if (!res.ok) {
          setHoldingId(null);
          setHoldingSourceAccountId(null);
          setShares("");
          setCostPrice("");
          return;
        }
        const j = (await res.json()) as {
          holding: { id: string; accountId: string; shares: string; costPrice: string } | null;
        };
        const h = j.holding;
        if (h) {
          setHoldingId(h.id);
          setShares(h.shares);
          setCostPrice(h.costPrice);
          setHoldingSourceAccountId(h.accountId);
          if (!accountIdParam) {
            setAccountId(h.accountId);
          }
        } else {
          setHoldingId(null);
          setHoldingSourceAccountId(null);
          setShares("");
          setCostPrice("");
        }
      } catch {
        setHoldingId(null);
        setHoldingSourceAccountId(null);
        setShares("");
        setCostPrice("");
      }
    }
    void loadHoldingAcrossAccounts();
  }, [session?.user, quote?.fundCode, accountIdParam]);

  const profit = useMemo(() => {
    const s = Number(shares);
    const c = Number(costPrice);
    if (!quote || !Number.isFinite(s) || s <= 0) {
      return null;
    }
    return calculateFundProfit({
      shares: s,
      estimateNav: quote.estimateNav ?? quote.nav,
      nav: quote.nav,
      costPrice: Number.isFinite(c) && c >= 0 ? c : undefined,
    });
  }, [quote, shares, costPrice]);

  async function handleSaveHolding() {
    if (!session?.user) {
      setError("请先登录后再保存持仓");
      return;
    }
    if (!quote?.fundCode) return;
    if (!accountId) {
      setError("请先选择账户");
      return;
    }
    const s = Number(shares);
    const c = Number(costPrice);
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(c) || c < 0) {
      setError("请填写有效的份额与成本");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(holdingId ? `/api/holdings/${holdingId}` : "/api/holdings", {
        method: holdingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: holdingId
          ? JSON.stringify({ shares: s, costPrice: c, accountId })
          : JSON.stringify({
              fundCode: quote.fundCode,
              fundName: quote.fundName,
              shares: s,
              costPrice: c,
              accountId: accountId || undefined,
            }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: unknown };
        const msg =
          typeof j.error === "string"
            ? j.error
            : j.error && typeof j.error === "object"
              ? JSON.stringify(j.error)
              : res.status === 409
                ? "无法在目标账户保存两条相同基金持仓"
                : "保存失败";
        throw new Error(msg);
      }
      alert(holdingId ? "持仓已更新" : "已加入持仓");
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  if (!codeParam) {
    return (
      <div className="space-y-3">
        <Link href="/" className="text-sm text-[#1677ff] hover:underline">
          ← 返回首页
        </Link>
        <p className="text-sm text-[#6a7ea8]">缺少基金代码，请从首页搜索。</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-sm text-[#1677ff] hover:underline">
          ← 返回首页
        </Link>
        {quote && (
          <Link
            href={`/funds/${encodeURIComponent(quote.fundCode)}`}
            className="text-sm text-[#1677ff] hover:underline"
          >
            基金详情页
          </Link>
        )}
      </div>

      {loading && !quote && <p className="text-sm text-[#6a7ea8]">加载中…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {quote && (
        <>
          <section className="rounded-xl border border-[#dbe5ff] bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h1 className="text-lg font-semibold text-[#1f2a44]">
                  {quote.fundName || "—"}{" "}
                  <span className="text-xs text-[#8ea1c8]">{quote.fundCode}</span>
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                disabled={status === "loading"}
                className="rounded-md border border-[#1677ff] bg-[#eaf4ff] px-3 py-1.5 text-xs font-medium text-[#1677ff] hover:bg-[#d9e8ff] disabled:opacity-50"
              >
                自选分组
              </button>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-[11px] text-[#8ea1c8]">净值</dt>
                <dd className="font-medium text-[#1f2a44]">
                  {quote.nav !== undefined ? fmtNav(quote.nav) : "—"}{" "}
                  <span className="text-[11px] text-[#8ea1c8]">
                    {quote.navDate ? `（${quote.navDate}）` : ""}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#8ea1c8]">估值 / 涨跌</dt>
                <dd className="font-medium text-[#1f2a44]">
                  {quote.estimateNav !== undefined ? fmtNav(quote.estimateNav) : "—"}{" "}
                  {quote.estimateChangeRate !== undefined && (
                    <span
                      className={quote.estimateChangeRate >= 0 ? "text-red-500" : "text-[#1677ff]"}
                    >
                      {quote.estimateChangeRate >= 0 ? "+" : ""}
                      {fmtPct(quote.estimateChangeRate)}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-[#dbe5ff] bg-white p-3 shadow-sm">
            <h2 className="text-sm font-medium text-[#1f2a44]">
              试算与持仓
              {holdingId && (
                <span className="ml-2 text-xs font-normal text-[#1677ff]">（已持有，可修改）</span>
              )}
            </h2>
            <p className="mt-1 text-xs text-[#8ea1c8]">
              份额、成本以仓库数据为准；无持仓时请自填。行情来自上方净值/估值，无明确数值处不会用默认数占位。
            </p>
            {holdingId &&
              holdingSourceAccountId &&
              accountId &&
              holdingSourceAccountId !== accountId && (
                <p className="mt-1 text-xs text-[#d97706]">
                  保存后本条持仓将移至当前所选账户（目标账户若已有同一基金将无法保存）
                </p>
              )}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-[#6a7ea8]">账户</span>
                <select
                  className="rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2.5 py-1.5 text-sm text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-[#6a7ea8]">份额</span>
                <input
                  className="rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2.5 py-1.5 text-sm text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  inputMode="decimal"
                  placeholder="必填，试算需大于 0"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="text-xs text-[#6a7ea8]">成本（元/份）</span>
                <input
                  className="rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2.5 py-1.5 text-sm text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="保存持仓时必填"
                />
              </label>
            </div>
            {profit && (
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:text-sm">
                <div>
                  <dt className="text-[#8ea1c8]">市值(估)</dt>
                  <dd className="font-medium text-[#1f2a44]">{fmtMoney(profit.estimateValue)}</dd>
                </div>
                <div>
                  <dt className="text-[#8ea1c8]">市值(净)</dt>
                  <dd className="font-medium text-[#1f2a44]">{fmtMoney(profit.navValue)}</dd>
                </div>
              </dl>
            )}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => void handleSaveHolding()}
                disabled={loading || status === "loading"}
                className="rounded-md bg-[#1677ff] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0e66e8] disabled:opacity-50"
              >
                {holdingId ? "更新我的持仓" : "保存为我的持仓"}
              </button>
            </div>
          </section>
        </>
      )}

      <WatchlistGroupDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        fundCode={quote?.fundCode ?? codeParam}
        fundName={quote?.fundName ?? ""}
      />
    </div>
  );
}

export function FundQueryPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#6a7ea8]">加载中…</p>}>
      <FundQueryPageInner />
    </Suspense>
  );
}
