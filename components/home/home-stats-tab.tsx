"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { HoldingStatsByCategory } from "@/services/statsService";

type Dim = "account" | "owner";

type AccountOption = { id: string; name: string; owner?: string | null };
type OwnerOption = { id: string; name: string };

type StatsResponse = {
  totalValue: number;
  groups: HoldingStatsByCategory["groups"];
};

function fmtMoney(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function fmtPctSafe(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0.00%";
  return fmtPct(n);
}

function donutSegments(items: Array<{ value: number; color: string }>) {
  const total = items.reduce((s, it) => s + (Number.isFinite(it.value) ? it.value : 0), 0);
  if (total <= 0) return [];
  let acc = 0;
  return items.map((it) => {
    const pct = Math.max(0, it.value) / total;
    const start = acc;
    acc += pct;
    return { color: it.color, pct, offset: start };
  });
}

export function HomeStatsTab() {
  const [dim, setDim] = useState<Dim>("owner");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedOwnerName, setSelectedOwnerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportNodeRef = useRef<HTMLDivElement | null>(null);
  const [nowText, setNowText] = useState("");

  // 拉账户 & 归属人选项
  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const [accRes, ownerRes] = await Promise.all([
          fetch("/api/accounts"),
          fetch("/api/account-owners"),
        ]);

        if (accRes.ok) {
          const accData = (await accRes.json()) as AccountOption[];
          if (!cancelled) {
            setAccounts(accData);
            if (!selectedAccountId && accData.length > 0) {
              setSelectedAccountId(accData[0]!.id);
            }
          }
        } else if (!cancelled) {
          setAccounts([]);
        }

        if (ownerRes.ok) {
          const j = (await ownerRes.json()) as { owners?: OwnerOption[] };
          if (!cancelled) {
            setOwners(j.owners ?? []);
            if (!selectedOwnerName && j.owners && j.owners.length > 0) {
              setSelectedOwnerName(j.owners[0]!.name);
            }
          }
        } else if (!cancelled) {
          setOwners([]);
        }
      } catch {
        if (!cancelled) {
          setAccounts([]);
          setOwners([]);
        }
      }
    }

    void loadOptions();
    return () => {
      cancelled = true;
    };
    // 不依赖 selectedAccountId/selectedOwnerName，避免死循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canQuery = useMemo(() => {
    if (dim === "account") {
      return !!selectedAccountId;
    }
    return !!selectedOwnerName;
  }, [dim, selectedAccountId, selectedOwnerName]);

  // 拉统计数据
  useEffect(() => {
    if (!canQuery) {
      setStats(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("dim", dim);
    if (dim === "account" && selectedAccountId) {
      params.set("accountId", selectedAccountId);
    }
    if (dim === "owner" && selectedOwnerName) {
      params.set("ownerName", selectedOwnerName);
    }

    (async () => {
      try {
        const res = await fetch(`/api/stats/holdings-by-category?${params.toString()}`);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) {
            setStats(null);
            setError(j.error || "加载统计失败");
          }
          return;
        }
        const data = (await res.json()) as StatsResponse;
        if (!cancelled) {
          setStats(data);
        }
      } catch {
        if (!cancelled) {
          setStats(null);
          setError("网络错误");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dim, selectedAccountId, selectedOwnerName, canQuery]);

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

  const totalValue = stats?.totalValue ?? 0;

  const orderedGroups = useMemo(() => {
    if (!stats) return [];
    const priority = ["债券", "股基", "大宗"];
    const indexMap = new Map<string, number>();
    stats.groups.forEach((g, idx) => indexMap.set(g.bigName, idx));

    const weight = (name: string) => {
      const pIdx = priority.indexOf(name);
      if (pIdx !== -1) return pIdx;
      return priority.length + (indexMap.get(name) ?? 0);
    };

    return [...stats.groups].sort((a, b) => weight(a.bigName) - weight(b.bigName));
  }, [stats]);

  const bigColors = ["#1677ff", "#ffb020", "#00b96b", "#7c3aed", "#ef4444", "#0ea5e9", "#14b8a6"];

  const donut = useMemo(() => {
    const items = orderedGroups.map((g, idx) => ({
      name: g.bigName,
      pct: g.bigPct,
      value: g.bigValue,
      color: bigColors[idx % bigColors.length]!,
    }));
    return {
      items,
      segments: donutSegments(items.map((x) => ({ value: x.value, color: x.color }))),
    };
  }, [orderedGroups]);

  async function exportCurrentStatsAsImage() {
    if (exporting) return;
    setExporting(true);

    try {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        // 等待统计加载完成且渲染节点存在
        if (
          !loading &&
          !error &&
          stats &&
          stats.totalValue > 0 &&
          exportNodeRef.current
        ) {
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 80));
      }

      if (!exportNodeRef.current || !stats || stats.totalValue <= 0) {
        alert("导出失败：统计数据未就绪");
        return;
      }

      // 让布局稳定一帧（避免刚切换维度时截图截到半渲染）
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 60));
      });

      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(exportNodeRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });

      const ts = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const dimLabel = dim === "owner" ? "归属人" : "账户";
      const scopeLabel =
        dim === "owner" ? (selectedOwnerName?.trim() || "未选择") : (selectedAccountId?.trim() || "未选择");
      const filename = `统计-${dimLabel}-${scopeLabel}-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(
        ts.getDate(),
      )}-${pad(ts.getHours())}${pad(ts.getMinutes())}.png`;

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="rounded-lg border border-[#dbe5ff] bg-white p-2 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-[#1f2a44]">统计</h3>
        <button
          type="button"
          onClick={() => void exportCurrentStatsAsImage()}
          disabled={exporting}
          className="rounded-md border border-[#dbe5ff] bg-white px-2 py-0.5 text-[11px] font-medium text-[#5e6f95] hover:bg-[#f5f8ff] disabled:opacity-50"
          title="导出当前统计图表"
        >
          {exporting ? "生成中…" : "保存图片"}
        </button>
        <div className="inline-flex items-center gap-1 rounded-full bg-[#f5f8ff] px-1 py-0.5 text-[11px] text-[#4d5f87]">
          <button
            type="button"
            onClick={() => setDim("account")}
            className={`rounded-full px-2 py-0.5 ${
              dim === "account" ? "bg-[#1677ff] text-white" : "text-[#4d5f87]"
            }`}
          >
            按账户
          </button>
          <button
            type="button"
            onClick={() => setDim("owner")}
            className={`rounded-full px-2 py-0.5 ${
              dim === "owner" ? "bg-[#1677ff] text-white" : "text-[#4d5f87]"
            }`}
          >
            按归属人
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#4d5f87]">
          {dim === "account" ? (
            <>
              <span>账户：</span>
              <select
                value={selectedAccountId ?? ""}
                onChange={(e) => setSelectedAccountId(e.target.value || null)}
                className="min-w-[9rem] rounded border border-[#dbe5ff] bg-white px-1.5 py-0.5 text-[11px] text-[#1f2a44]"
              >
                {accounts.length === 0 && <option value="">无账户</option>}
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.owner ? `（${a.owner}）` : ""}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span>归属人：</span>
              <select
                value={selectedOwnerName ?? ""}
                onChange={(e) => setSelectedOwnerName(e.target.value || null)}
                className="min-w-[7rem] rounded border border-[#dbe5ff] bg-white px-1.5 py-0.5 text-[11px] text-[#1f2a44]"
              >
                {owners.length === 0 && <option value="">无归属人</option>}
                {owners.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <div className="ml-auto text-[10px] text-[#8ea1c8]">
          金额口径：净值市值（与首页持仓一致）
        </div>
      </div>

      {loading && <p className="text-xs text-[#6a7ea8]">统计中…</p>}
      {!loading && error && <p className="text-xs text-red-500">{error}</p>}
      {!loading && !error && (!stats || totalValue <= 0) && (
        <p className="text-xs text-[#6a7ea8]">暂无持仓数据</p>
      )}

      {!loading && !error && stats && totalValue > 0 && (
        <div ref={exportNodeRef} className="mt-2 space-y-2">
          {/* 大类占比（全部）环形图 */}
          <div className="relative flex flex-wrap items-center justify-center gap-6 rounded-lg border border-[#e8efff] bg-[#f9fbff] px-3 py-2 text-center">
            <div className="absolute right-3 top-2 text-[11px] text-[#8ea1c8] tabular-nums">
              {nowText}
            </div>
            <div className="shrink-0">
              <svg width="120" height="120" viewBox="0 0 42 42" aria-hidden>
                <circle
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="transparent"
                  stroke="#e8efff"
                  strokeWidth="6"
                />
                {donut.segments.map((seg, i) => (
                  <circle
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    cx="21"
                    cy="21"
                    r="15.915"
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="6"
                    strokeDasharray={`${(seg.pct * 100).toFixed(6)} ${(100 - seg.pct * 100).toFixed(6)}`}
                    strokeDashoffset={`${(25 - seg.offset * 100).toFixed(6)}`}
                  />
                ))}
                <circle cx="21" cy="21" r="11" fill="#fff" />
              </svg>
            </div>
            <div className="min-w-[14rem]">
              <div className="text-xs font-semibold text-[#1f2a44]">大类占比（全部）</div>
              <div className="mt-1 grid grid-cols-[auto_auto] justify-center gap-x-6 gap-y-1 text-[11px] text-[#4d5f87] [font-variant-numeric:tabular-nums]">
                {donut.items.map((it) => (
                  <Fragment key={it.name}>
                    <div className="text-left">
                      <span
                        className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                        style={{ backgroundColor: it.color }}
                        aria-hidden
                      />
                      <span className="align-middle">{it.name}</span>
                    </div>
                    <div className="text-right text-[#1f2a44]">{fmtPctSafe(it.pct)}</div>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>

          <div className={exporting ? "overflow-visible" : "overflow-x-auto"}>
            <table className="min-w-full border-collapse text-[11px] text-[#1f2a44] [font-variant-numeric:tabular-nums]">
            <thead>
              <tr className="bg-[#f5f8ff] text-[#4d5f87]">
                <th className="border border-[#e4ecff] px-2 py-1 text-center">大类</th>
                <th className="border border-[#e4ecff] px-2 py-1 text-center">小类</th>
                <th className="border border-[#e4ecff] px-2 py-1 text-left">代码</th>
                <th className="border border-[#e4ecff] px-2 py-1 text-left">基金名称</th>
                <th className="border border-[#e4ecff] px-2 py-1 text-right">占比</th>
                <th className="border border-[#e4ecff] px-2 py-1 text-right">持有金额</th>
                <th className="border border-[#e4ecff] px-2 py-1 text-center">小类占全部</th>
              </tr>
            </thead>
            <tbody>
              {/* 总计行置顶 */}
              <tr className="bg-[#ffeec2]">
                <td className="border border-[#e4ecff] px-2 py-1 text-[#7a4b00]">总计</td>
                <td className="border border-[#e4ecff] px-2 py-1" />
                <td className="border border-[#e4ecff] px-2 py-1" />
                <td className="border border-[#e4ecff] px-2 py-1" />
                <td className="border border-[#e4ecff] px-2 py-1 text-right text-[#7a4b00]">100.00%</td>
                <td className="border border-[#e4ecff] px-2 py-1 text-right font-semibold text-[#7a4b00]">
                  {fmtMoney(totalValue)}
                </td>
                <td className="border border-[#e4ecff] px-2 py-1" />
              </tr>
              {orderedGroups.map((g) => {
                const bigRowSpan = g.smalls.reduce(
                  (sum, s) => sum + s.funds.length,
                  0,
                );
                return (
                  <Fragment key={g.bigName}>
                    {g.smalls.map((s, idxSmall) => {
                      const smallOfTotal = totalValue > 0 ? s.smallValue / totalValue : 0;
                      const smallDonutColor =
                        donut.items.find((it) => it.name === g.bigName)?.color ?? "#1677ff";
                      return (
                        <Fragment key={`${g.bigName}-${s.smallName}`}>
                          {s.funds.map((f, idxFund) => (
                            <tr key={`${f.code}-${idxFund}`}>
                              {idxSmall === 0 && idxFund === 0 && (
                                <td
                                  rowSpan={bigRowSpan}
                                  className="border border-[#f0f4ff] px-2 py-1 text-center align-middle"
                                >
                                  {g.bigName}
                                </td>
                              )}
                              {idxFund === 0 && (
                                <td
                                  rowSpan={s.funds.length}
                                  className="border border-[#f0f4ff] px-2 py-1 text-center align-middle"
                                >
                                  {s.smallName}
                                </td>
                              )}
                              <td className="border border-[#f0f4ff] px-2 py-1 text-left text-[#6a7ea8]">
                                {f.code}
                              </td>
                              <td className="border border-[#f0f4ff] px-2 py-1">{f.name}</td>
                              <td className="border border-[#f0f4ff] px-2 py-1 text-right text-[#4d5f87]">
                                {fmtPctSafe(f.pct)}
                              </td>
                              <td className="border border-[#f0f4ff] px-2 py-1 text-right">
                                {fmtMoney(f.value)}
                              </td>
                              {idxFund === 0 && (
                                <td
                                  rowSpan={s.funds.length}
                                  className="border border-[#f0f4ff] px-1 py-1 text-center align-middle"
                                >
                                  <svg
                                    width="40"
                                    height="40"
                                    viewBox="0 0 42 42"
                                    className="mx-auto"
                                    aria-hidden
                                  >
                                    <circle
                                      cx="21"
                                      cy="21"
                                      r="15.915"
                                      fill="transparent"
                                      stroke="#edf2ff"
                                      strokeWidth="5"
                                    />
                                    <circle
                                      cx="21"
                                      cy="21"
                                      r="15.915"
                                      fill="transparent"
                                      stroke={smallDonutColor}
                                      strokeWidth="5"
                                      strokeDasharray={`${(smallOfTotal * 100).toFixed(6)} ${(100 - smallOfTotal * 100).toFixed(6)}`}
                                      strokeDashoffset="25"
                                    />
                                    <circle cx="21" cy="21" r="11" fill="#fff" />
                                  </svg>
                                  <div className="mt-0.5 text-[10px] text-[#4d5f87]">
                                    {fmtPctSafe(smallOfTotal)}
                                  </div>
                                  <div className="mt-0.5 text-[10px] font-semibold text-[#1f2a44]">
                                    {fmtMoney(s.smallValue)}
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  {/* 大类小计行 */}
                  <tr className="bg-[#f0f4ff]">
                    <td className="border border-[#e4ecff] px-2 py-1 text-[#1f2a44]">
                      小计（{g.bigName}）
                    </td>
                    <td className="border border-[#e4ecff] px-2 py-1" />
                    <td className="border border-[#e4ecff] px-2 py-1" />
                    <td className="border border-[#e4ecff] px-2 py-1" />
                    <td className="border border-[#e4ecff] px-2 py-1 text-right text-[#1f2a44]">
                      {fmtPctSafe(g.bigPct)}
                    </td>
                    <td className="border border-[#e4ecff] px-2 py-1 text-right font-semibold">
                      {fmtMoney(g.bigValue)}
                    </td>
                    <td className="border border-[#e4ecff] px-2 py-1" />
                  </tr>
                </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </section>
  );
}

