"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Decimal from "decimal.js";
import { calculateFundProfit } from "@/lib/calculate";
import type { FundQuote } from "@/types/fund";
import { useMessage } from "@/components/common/message-provider";

function fmtMoney(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNav(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtSignedPctFromDecimal(n: number) {
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
}

type Props = {
  fundCode: string;
  fundName: string;
  initialQuote: FundQuote;
  initialAccountId?: string;
  /**
   * default: 自己包一层外观卡片
   * embedded: 用于与详情页顶部净值合并到同一个外观卡片（去掉自身边框/阴影/内边距）
   */
  variant?: "default" | "embedded";
};

export function FundDetailClient({
  fundCode,
  fundName,
  initialQuote,
  initialAccountId,
  variant = "default",
}: Props) {
  const { data: session, status } = useSession();
  const message = useMessage();
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [holdingSourceAccountId, setHoldingSourceAccountId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [accountId, setAccountId] = useState("");
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");
  const [loading, setLoading] = useState(false);
  const autoSelectedFundRef = useRef<string | null>(null);
  const [deltaAmount, setDeltaAmount] = useState("");

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
          if (initialAccountId && rows.some((x) => x.id === initialAccountId)) return initialAccountId;
          return rows[0]?.id ?? "";
        });
      } catch {
        // ignore
      }
    }
    void loadAccounts();
  }, [session?.user, initialAccountId]);

  useEffect(() => {
    async function loadMyHolding() {
      if (!session?.user) {
        autoSelectedFundRef.current = null;
        setHoldingId(null);
        setHoldingSourceAccountId(null);
        setShares("");
        setCost("");
        return;
      }

      try {
        // 无显式 initialAccountId 时：只在“首次加载该基金”尝试跨账户自动选中有持仓的账户；
        // 之后切换 accountId 时，始终按 accountId + fundCode 定位持仓，避免多个账户同基金互相覆盖。
        if (!initialAccountId && autoSelectedFundRef.current !== fundCode) {
          const resAny = await fetch(`/api/holdings/lookup?fundCode=${encodeURIComponent(fundCode)}`);
          if (!resAny.ok) throw new Error("lookup failed");
          const jAny = (await resAny.json()) as {
            holding: { id: string; accountId: string; shares: string; costPrice: string } | null;
          };
          const hAny = jAny.holding;
          autoSelectedFundRef.current = fundCode; // 不再重复跨账户查询
          if (hAny) {
            setAccountId(hAny.accountId);
            setHoldingId(hAny.id);
            setHoldingSourceAccountId(hAny.accountId);
            setShares(hAny.shares);
            setCost(hAny.costPrice);
            return;
          }
        }

        if (!accountId) {
          setHoldingId(null);
          setHoldingSourceAccountId(null);
          setShares("");
          setCost("");
          return;
        }

        const res = await fetch(
          `/api/holdings/lookup?fundCode=${encodeURIComponent(fundCode)}&accountId=${encodeURIComponent(accountId)}`,
        );
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
  }, [session?.user, fundCode, initialAccountId, accountId]);

  const profit = useMemo(() => {
    const s = Number(shares);
    const c = Number(cost);
    if (!Number.isFinite(s) || s <= 0) {
      return null;
    }
    return calculateFundProfit({
      shares: s,
      estimateNav: initialQuote.estimateNav ?? initialQuote.nav,
      // “当日净值总金额/最新净值”不要走估算口径；优先使用官方净值（通常为上个交易日已更新）
      nav: initialQuote.officialNav ?? initialQuote.nav,
      costPrice: Number.isFinite(c) && c >= 0 ? c : undefined,
    });
  }, [shares, cost, initialQuote.estimateNav, initialQuote.nav, initialQuote.officialNav]);

  const costAmount = useMemo(() => {
    try {
      const s = new Decimal(shares);
      const c = new Decimal(cost);
      if (s.lte(0) || c.lt(0)) return null;
      return c.mul(s).toNumber();
    } catch {
      return null;
    }
  }, [shares, cost]);

  const officialNavDate = initialQuote.officialNavDate?.trim() || undefined;
  const estimateDate = initialQuote.estimateTime?.slice(0, 10) || undefined;
  const officialNav = initialQuote.officialNav;
  const estimateNav = initialQuote.estimateNav;
  const officialChangeRate = initialQuote.officialChangeRate;
  const estimateChangeRate = initialQuote.estimateChangeRate;
  const defaultTradePrice = (estimateNav ?? officialNav ?? initialQuote.nav) ?? undefined;

  async function persistHolding(nextShares: number, nextCost: number) {
    if (!session?.user) {
      message.error("请先登录");
      return;
    }
    if (!accountId) {
      message.error("请选择账户");
      return;
    }
    const s = nextShares;
    const c = nextCost;
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(c) || c < 0) {
      message.error("请填写有效份额与成本");
      return;
    }
    setLoading(true);
    try {
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
              accountId: accountId || undefined,
            }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        const text =
          typeof j.error === "string"
            ? j.error
            : j.error && typeof j.error === "object"
              ? JSON.stringify(j.error)
              : res.status === 409
                ? "无法在目标账户保存两条相同基金持仓"
                : "保存失败";
        message.error(text);
        return;
      }

      const saved = await res.json().catch(() => null);
      if (saved && typeof saved.id === "string") setHoldingId(saved.id);
      setShares(String(s));
      setCost(String(c));

      message.success(holdingId ? "持仓已更新" : "已加入持仓");
      setHoldingSourceAccountId(accountId);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const s = Number(shares);
    const c = Number(cost);
    await persistHolding(s, c);
  }

  async function clearHolding() {
    if (!holdingId) return;
    if (!session?.user) {
      message.error("请先登录");
      return;
    }
    const ok = window.confirm("确认清仓吗？清仓后会删除当前账户下该基金持仓。");
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/holdings/${holdingId}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        message.error(typeof j.error === "string" ? j.error : "清仓失败");
        return;
      }
      setHoldingId(null);
      setHoldingSourceAccountId(null);
      setShares("");
      setCost("");
      setDeltaAmount("");
      message.success("已清仓");
    } finally {
      setLoading(false);
    }
  }

  async function applyBuy() {
    const amt = Number(deltaAmount);
    const price =
      defaultTradePrice !== undefined ? defaultTradePrice : NaN;

    if (!Number.isFinite(amt) || amt <= 0) {
      message.error("请输入本次加仓金额（> 0）");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      message.error("无法获取有效价格，暂时无法按金额换算份额");
      return;
    }
    const dS = new Decimal(amt).div(new Decimal(price));

    const curS = Number(shares);
    const curC = Number(cost);
    // 无持仓或当前输入为空：直接用本次作为初始
    if (!Number.isFinite(curS) || curS <= 0 || !Number.isFinite(curC) || curC < 0) {
      await persistHolding(dS.toNumber(), price);
      setDeltaAmount("");
      return;
    }
    const nextS = new Decimal(curS).plus(dS);
    // 加仓金额 = price * dS = amt：用金额口径更稳定
    const nextCost = new Decimal(curC).mul(new Decimal(curS)).plus(new Decimal(amt)).div(nextS);
    await persistHolding(nextS.toNumber(), nextCost.toNumber());
    setDeltaAmount("");
  }

  async function applySell() {
    const amt = Number(deltaAmount);
    const price =
      defaultTradePrice !== undefined ? defaultTradePrice : NaN;

    if (!holdingId) {
      message.error("当前账户下没有该基金持仓");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      message.error("请输入本次减仓金额（> 0）");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      message.error("无法获取有效价格，暂时无法按金额换算份额");
      return;
    }
    const dS = new Decimal(amt).div(new Decimal(price));
    const curS = Number(shares);
    const curC = Number(cost);
    if (!Number.isFinite(curS) || curS <= 0 || !Number.isFinite(curC) || curC < 0) {
      message.error("当前持仓份额/成本不合法，请先修正");
      return;
    }
    if (dS.gt(new Decimal(curS))) {
      message.error("减仓金额过大（换算份额超过当前持仓）");
      return;
    }
    const nextS = new Decimal(curS).minus(dS);
    if (nextS.lte(0)) {
      await clearHolding();
      return;
    }
    await persistHolding(nextS.toNumber(), curC);
    setDeltaAmount("");
  }

  const outerClassName =
    variant === "embedded"
      ? "bg-transparent border-0 shadow-none p-0"
      : "rounded-lg border border-[#dbe5ff] bg-white p-3 shadow-sm";

  return (
    <section className={outerClassName}>
      {variant !== "embedded" ? (
        <h2 className="text-sm font-medium text-[#1f2a44]">
          试算与持仓
          {holdingId && <span className="ml-2 text-xs font-normal text-[#1677ff]">（已持有，可修改）</span>}
        </h2>
      ) : null}
      <p className="mt-1 text-xs text-[#8ea1c8]">
        份额、成本以仓库数据为准；无持仓时请自填。行情来自上方净值/估值，无明确数值处不会用默认数占位。
      </p>
      {holdingId && holdingSourceAccountId && accountId && holdingSourceAccountId !== accountId && (
        <p className="mt-1 text-xs text-[#d97706]">
          保存后本条持仓将移至当前所选账户（目标账户若已有同一基金将无法保存）
        </p>
      )}

      {/*
        编辑区/展示区拆分：
        - 左：输入（可编辑）
        - 右：汇总（纯展示）
      */}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-[#e8efff] bg-white p-3 shadow-[inset_0_0_0_1px_rgba(223,233,255,0.55)]">
          <div className="grid gap-2 sm:grid-cols-12">
            <label className="flex flex-col gap-1 text-sm sm:col-span-12">
              <span className="text-xs text-[#6a7ea8]">账户</span>
              <select
                className="rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2.5 py-1.5 text-sm text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                disabled={!session?.user || accounts.length === 0}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm sm:col-span-5">
              <span className="text-xs text-[#6a7ea8]">份额</span>
              <input
                className="rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2.5 py-1.5 text-sm text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                inputMode="decimal"
                placeholder="必填，试算需大于 0"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm sm:col-span-5">
              <span className="text-xs text-[#6a7ea8]">成本（元/份）</span>
              <input
                className="rounded-md border border-[#dbe5ff] bg-[#f8fbff] px-2.5 py-1.5 text-sm text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                inputMode="decimal"
                placeholder="保存持仓时必填"
              />
            </label>

            <div className="flex items-end sm:col-span-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={loading || status === "loading"}
                className="h-9 w-full rounded-md bg-[#1677ff] px-3 text-xs font-medium text-white hover:bg-[#0e66e8] disabled:opacity-50"
              >
                更新
              </button>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-[#eef2fb] bg-[#fbfcff] p-2.5">
            <p className="text-[11px] font-medium text-[#5e6f95]">增/减仓</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-sm min-w-[180px]">
                <span className="text-xs text-[#6a7ea8]">本次金额（元）</span>
                <input
                  className="rounded-md border border-[#dbe5ff] bg-white px-2.5 py-1.5 text-sm text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
                  value={deltaAmount}
                  onChange={(e) => setDeltaAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="例如 300"
                />
              </label>

              <button
                type="button"
                onClick={() => void applyBuy()}
                disabled={loading || status === "loading"}
                className="h-9 rounded-md border border-[#bcdcff] bg-[#eaf4ff] px-3 text-xs font-medium text-[#1677ff] hover:bg-[#deefff] disabled:opacity-50"
              >
                加仓
              </button>
              <button
                type="button"
                onClick={() => void applySell()}
                disabled={loading || status === "loading"}
                className="h-9 rounded-md border border-[#ffd2d9] bg-[#fff1f2] px-3 text-xs font-medium text-[#e11d48] hover:bg-[#ffe6ea] disabled:opacity-50"
              >
                减仓
              </button>
              {holdingId ? (
                <button
                  type="button"
                  onClick={() => void clearHolding()}
                  disabled={loading || status === "loading"}
                  className="h-9 rounded-md border border-[#e8efff] bg-white px-3 text-xs font-medium text-[#5e6f95] hover:bg-[#f5f8ff] disabled:opacity-50"
                >
                  清仓
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-[10px] leading-snug text-[#8ea1c8]">
              系统会用当前可用净值/估值把金额换算成份额变化并保存；加仓按加权平均自动计算新成本；减仓默认不改变成本，减到 0 会清仓删除该持仓。
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-[#e8efff] bg-[#f9fbff] p-3">
          <dl className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
            <div>
              <dt className="text-[#8ea1c8]">最新涨幅({officialNavDate ?? "—"})</dt>
              <dd
                className={`font-medium ${
                  typeof officialChangeRate === "number"
                    ? officialChangeRate >= 0
                      ? "text-[#ff5f6d]"
                      : "text-[#00d26a]"
                    : "text-[#1f2a44]"
                }`}
              >
                {typeof officialChangeRate === "number" ? fmtSignedPctFromDecimal(officialChangeRate) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#8ea1c8]">估算涨幅({estimateDate ?? "—"})</dt>
              <dd
                className={`font-medium ${
                  typeof estimateChangeRate === "number"
                    ? estimateChangeRate >= 0
                      ? "text-[#ff5f6d]"
                      : "text-[#00d26a]"
                    : "text-[#1f2a44]"
                }`}
              >
                {typeof estimateChangeRate === "number" ? fmtSignedPctFromDecimal(estimateChangeRate) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#8ea1c8]">最新净值({officialNavDate ?? "—"})</dt>
              <dd className="font-medium text-[#1f2a44]">{officialNav !== undefined ? fmtNav(officialNav) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[#8ea1c8]">估算净值({estimateDate ?? "—"})</dt>
              <dd className="font-medium text-[#1f2a44]">{estimateNav !== undefined ? fmtNav(estimateNav) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[#8ea1c8]">
                市值({officialNavDate ?? "—"} 净)
              </dt>
              <dd className="font-medium text-[#1f2a44]">{profit ? fmtMoney(profit.navValue) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[#8ea1c8]">
                市值({estimateDate ?? "—"} 估)
              </dt>
              <dd className="font-medium text-[#1f2a44]">{profit ? fmtMoney(profit.estimateValue) : "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[#8ea1c8]">我的成本金额</dt>
              <dd className="font-medium text-[#1f2a44]">{costAmount !== null ? fmtMoney(costAmount) : "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* msg + 保存按钮已移到左侧编辑区；汇总信息已移到右侧展示区 */}
    </section>
  );
}
