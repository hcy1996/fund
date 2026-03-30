"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { calculateFundProfit } from "@/lib/calculate";
import { fundTrialEstimateNavInput, fundTrialNavInput } from "@/lib/fundTrialPrefill";
import type { FundQuote } from "@/types/fund";

function fmtMoney(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { fundCode: string; fundName: string; initialQuote: FundQuote };

export function FundDetailClient({ fundCode, fundName, initialQuote }: Props) {
  const { data: session } = useSession();
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [holdingSourceAccountId, setHoldingSourceAccountId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [accountId, setAccountId] = useState("");
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");
  const [nav, setNav] = useState(() => fundTrialNavInput(initialQuote));
  const [estimateNav, setEstimateNav] = useState(() => fundTrialEstimateNavInput(initialQuote));
  const [msg, setMsg] = useState<string | null>(null);

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
        setAccountId((prev) => (prev && rows.some((x) => x.id === prev) ? prev : rows[0]?.id ?? ""));
      } catch {
        // ignore
      }
    }
    void loadAccounts();
  }, [session?.user]);

  useEffect(() => {
    async function loadMyHolding() {
      if (!session?.user) {
        setHoldingId(null);
        setHoldingSourceAccountId(null);
        setShares("");
        setCost("");
        return;
      }
      try {
        const res = await fetch(`/api/holdings/lookup?fundCode=${encodeURIComponent(fundCode)}`);
        if (!res.ok) {
          setHoldingId(null);
          setHoldingSourceAccountId(null);
          setShares("");
          setCost("");
          return;
        }
        const j = (await res.json()) as {
          holding: { id: string; accountId: string; shares: string; costPrice: string } | null;
        };
        const h = j.holding;
        if (h) {
          setHoldingId(h.id);
          setHoldingSourceAccountId(h.accountId);
          setShares(h.shares);
          setCost(h.costPrice);
          setAccountId(h.accountId);
        } else {
          setHoldingId(null);
          setHoldingSourceAccountId(null);
          setShares("");
          setCost("");
        }
      } catch {
        setHoldingId(null);
        setHoldingSourceAccountId(null);
        setShares("");
        setCost("");
      }
    }
    void loadMyHolding();
  }, [session?.user, fundCode]);

  const profit = useMemo(() => {
    const s = Number(shares);
    const c = Number(cost);
    const n = Number(nav);
    const e = Number(estimateNav);
    if (!Number.isFinite(s) || s <= 0) {
      return null;
    }
    return calculateFundProfit({
      shares: s,
      nav: Number.isFinite(n) ? n : undefined,
      estimateNav: Number.isFinite(e) ? e : undefined,
      costPrice: Number.isFinite(c) && c >= 0 ? c : undefined,
    });
  }, [shares, cost, nav, estimateNav]);

  async function save() {
    if (!session?.user) {
      setMsg("请先登录");
      return;
    }
    if (!accountId) {
      setMsg("请选择账户");
      return;
    }
    const s = Number(shares);
    const c = Number(cost);
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(c) || c < 0) {
      setMsg("请填写有效份额与成本");
      return;
    }
    setMsg(null);
    const res = await fetch(holdingId ? `/api/holdings/${holdingId}` : "/api/holdings", {
      method: holdingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: holdingId
        ? JSON.stringify({ shares: s, costPrice: c, accountId })
        : JSON.stringify({
            fundCode,
            fundName,
            shares: s,
            costPrice: c,
            accountId,
          }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: unknown };
      const text =
        typeof j.error === "string" ? j.error : res.status === 409 ? "目标账户已有该基金持仓" : null;
      setMsg(text ?? "保存失败");
      return;
    }
    setMsg(holdingId ? "持仓已更新" : "已加入持仓");
    setHoldingSourceAccountId(accountId);
  }

  return (
    <section className="rounded-lg border border-[#dbe5ff] bg-white p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#1f2a44]">自定义试算 & 加入持仓</h2>
      {holdingId && <p className="mt-0.5 text-[10px] text-[#1677ff]">你已持有该基金，可直接编辑并更新。</p>}
      {holdingId && holdingSourceAccountId && accountId && holdingSourceAccountId !== accountId && (
        <p className="mt-0.5 text-[10px] text-[#d97706]">保存后本条持仓将移至所选账户。</p>
      )}
      <p className="mt-0.5 text-[10px] leading-snug text-[#8ea1c8]">
        净值、估算净值在能确定时由行情自动回填；没有的项留空，请自行填写后再试算。份额与成本仅在有持仓记录时回填，否则请自填。
      </p>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {session?.user && accounts.length > 0 && (
          <label className="text-xs sm:col-span-2">
            <span className="text-[#6a7ea8]">账户</span>
            <select
              className="mt-0.5 w-full rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2 py-1 text-sm"
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
        )}
        <label className="text-xs">
          <span className="text-[#6a7ea8]">份额</span>
          <input
            className="mt-0.5 w-full rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2 py-1 text-sm"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            inputMode="decimal"
            placeholder="有持仓时自动回填"
          />
        </label>
        <label className="text-xs">
          <span className="text-[#6a7ea8]">成本（元/份）</span>
          <input
            className="mt-0.5 w-full rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2 py-1 text-sm"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            inputMode="decimal"
            placeholder="保存持仓时必填"
          />
        </label>
        <label className="text-xs">
          <span className="text-[#6a7ea8]">净值（正式口径，可改）</span>
          <input
            className="mt-0.5 w-full rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2 py-1 text-sm"
            value={nav}
            onChange={(e) => setNav(e.target.value)}
            inputMode="decimal"
            placeholder="有披露则回填，否则留空"
          />
        </label>
        <label className="text-xs">
          <span className="text-[#6a7ea8]">估算净值（可改）</span>
          <input
            className="mt-0.5 w-full rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2 py-1 text-sm"
            value={estimateNav}
            onChange={(e) => setEstimateNav(e.target.value)}
            inputMode="decimal"
            placeholder="有估值则回填，否则留空"
          />
        </label>
      </div>
      {profit && (
        <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-[#8ea1c8]">市值(估)</dt>
            <dd className="text-[#1f2a44]">{fmtMoney(profit.estimateValue)}</dd>
          </div>
          <div>
            <dt className="text-[#8ea1c8]">相对成本盈亏</dt>
            <dd className="text-[#1f2a44]">
              {profit.totalProfit !== undefined
                ? `${profit.totalProfit >= 0 ? "+" : ""}${fmtMoney(profit.totalProfit)}`
                : "—"}
            </dd>
          </div>
        </dl>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-md bg-[#1677ff] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#0e66e8]"
        >
          {holdingId ? "更新持仓" : "加入持仓"}
        </button>
        {msg && <span className="text-xs text-[#1677ff]">{msg}</span>}
      </div>
    </section>
  );
}
