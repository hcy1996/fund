"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { FundNavHistoryDto, FundNavHistoryRange } from "@/types/fund";

const RANGE_TABS: { value: FundNavHistoryRange; label: string }[] = [
  { value: "1m", label: "近1月" },
  { value: "3m", label: "近3月" },
  { value: "6m", label: "近6月" },
  { value: "1y", label: "近1年" },
  { value: "3y", label: "近3年" },
  { value: "5y", label: "近5年" },
  { value: "max", label: "更多" },
];

type Props = { fundCode: string };

const W = 640;
const H = 232;
/** 纵轴「+XX.XX%」预留宽度 */
const PAD_L = 54;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 40;

function pickXTickIndices(len: number, maxTicks: number): number[] {
  if (len <= 1) return [0];
  const n = len - 1;
  const want = Math.min(maxTicks, len);
  const set = new Set<number>();
  for (let k = 0; k < want; k++) {
    const idx = Math.round((k * n) / Math.max(1, want - 1));
    set.add(Math.min(n, Math.max(0, idx)));
  }
  return [...set].sort((a, b) => a - b);
}

/** YYYY-MM-DD → x 轴刻度：同年区间用 MM-DD，跨年用 YY-MM-DD */
function formatNavAxisDate(date: string, rangeStart: string, rangeEnd: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return date;
  const [, y, mm, dd] = m;
  const y0 = rangeStart.slice(0, 4);
  const y1 = rangeEnd.slice(0, 4);
  if (y0 === y1) return `${mm}-${dd}`;
  return `${y.slice(2)}-${mm}-${dd}`;
}

function fmtYAxisPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function fmtNav(n: number): string {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/** A 股习惯：相对最新净值，成本低于现价则浮盈（红），高于则浮亏（绿） */
type CostLineTone = "profit" | "loss" | "flat";

const COST_LINE_STYLE: Record<
  CostLineTone,
  { stroke: string; fill: string }
> = {
  profit: { stroke: "#ff5f6d", fill: "#e84a58" },
  loss: { stroke: "#00d26a", fill: "#00b359" },
  flat: { stroke: "#9baccb", fill: "#6a7ea8" },
};

type PathGeom = {
  lineD: string;
  fillD: string;
  min: number;
  max: number;
  yTicks: number[];
  yTickLabels: string[];
  xTicks: { x: number; label: string }[];
  pointCount: number;
  rangeStart: string;
  rangeEnd: string;
  zeroLineY: number | null;
  coords: { x: number; y: number; date: string; nav: number; pctFromStart: number | null }[];
  usePct: boolean;
  innerH: number;
  nSeg: number;
  costLineY: number | null;
  costPct: number | null;
  costLineClipped: boolean;
  /** 相对区间最新净值的浮盈浮亏，用于成本线配色 */
  costLineTone: CostLineTone | null;
  fillGradientId: string;
};

const EMPTY_GEOM: PathGeom = {
  lineD: "",
  fillD: "",
  min: 0,
  max: 1,
  yTicks: [],
  yTickLabels: [],
  xTicks: [],
  pointCount: 0,
  rangeStart: "",
  rangeEnd: "",
  zeroLineY: null,
  coords: [],
  usePct: false,
  innerH: H - PAD_T - PAD_B,
  nSeg: 0,
  costLineY: null,
  costPct: null,
  costLineClipped: false,
  costLineTone: null,
  fillGradientId: "navFill",
};

function indexFromSvgX(xSvg: number, nSeg: number): number | null {
  const innerW = W - PAD_L - PAD_R;
  if (xSvg < PAD_L || xSvg > W - PAD_R || nSeg < 1) return null;
  const t = (xSvg - PAD_L) / innerW;
  const idx = Math.round(t * nSeg);
  return Math.min(nSeg, Math.max(0, idx));
}

export function FundNavChart({ fundCode }: Props) {
  const { data: session } = useSession();
  const [range, setRange] = useState<FundNavHistoryRange>("3m");
  const [data, setData] = useState<FundNavHistoryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holdingCost, setHoldingCost] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tipPos, setTipPos] = useState<{
    left: number;
    top: number;
    placeAbove: boolean;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  /** 定位 tooltip 的外层（避免 overflow-x 裁切纵轴方向的浮层） */
  const chartShellRef = useRef<HTMLDivElement | null>(null);

  const fillGradientId = useMemo(
    () => `navFill-${fundCode.replace(/[^\w-]/g, "_")}`,
    [fundCode],
  );

  const load = useCallback(async (r: FundNavHistoryRange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/funds/nav-history?code=${encodeURIComponent(fundCode)}&range=${encodeURIComponent(r)}`,
      );
      if (!res.ok) {
        throw new Error("加载失败");
      }
      setData((await res.json()) as FundNavHistoryDto);
    } catch {
      setError("历史净值加载失败");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fundCode]);

  useEffect(() => {
    void load(range);
  }, [fundCode, range, load]);

  useEffect(() => {
    setHoverIdx(null);
    setTipPos(null);
  }, [fundCode, range, data?.points]);

  useEffect(() => {
    if (!session?.user) {
      setHoldingCost(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/holdings/lookup?fundCode=${encodeURIComponent(fundCode)}`,
        );
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as {
          holding: { costPrice: string } | null;
        };
        const c = j.holding?.costPrice;
        const n = c != null ? Number(c) : NaN;
        if (!cancelled) {
          setHoldingCost(Number.isFinite(n) && n > 0 ? n : null);
        }
      } catch {
        if (!cancelled) setHoldingCost(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user, fundCode]);

  const paths = useMemo((): PathGeom => {
    const pts = data?.points ?? [];
    if (pts.length < 2) {
      return { ...EMPTY_GEOM, fillGradientId };
    }
    const baseNav = pts[0]!.nav;
    const usePct = baseNav > 0 && Number.isFinite(baseNav);
    const ySeries = usePct
      ? pts.map((p) => (p.nav / baseNav - 1) * 100)
      : pts.map((p) => p.nav);
    const rawMin = Math.min(...ySeries);
    const rawMax = Math.max(...ySeries);
    const pad = usePct
      ? Math.max((rawMax - rawMin) * 0.08, 0.05)
      : Math.max((rawMax - rawMin) * 0.08, rawMax * 0.002, 0.0001);
    const min = rawMin - pad;
    const max = rawMax + pad;
    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;
    const n = pts.length - 1;
    const coords = pts.map((p, i) => {
      const x = PAD_L + (innerW * i) / n;
      const yv = ySeries[i]!;
      const y = PAD_T + innerH - (innerH * (yv - min)) / (max - min || 1);
      return {
        x,
        y,
        date: p.date,
        nav: p.nav,
        pctFromStart: usePct ? yv : null,
      };
    });
    const lineD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
    const baseY = PAD_T + innerH;
    const fillD = `${lineD} L ${coords[coords.length - 1]!.x.toFixed(1)} ${baseY.toFixed(1)} L ${coords[0]!.x.toFixed(1)} ${baseY.toFixed(1)} Z`;

    const tickCount = 4;
    const yTicks: number[] = [];
    for (let t = 0; t <= tickCount; t++) {
      yTicks.push(min + ((max - min) * t) / tickCount);
    }
    const yTickLabels = usePct ? yTicks.map((v) => fmtYAxisPct(v)) : yTicks.map((v) => v.toFixed(4));

    const rangeStart = pts[0]!.date;
    const rangeEnd = pts[pts.length - 1]!.date;
    let zeroLineY: number | null = null;
    if (usePct && min < 0 && max > 0) {
      zeroLineY = PAD_T + innerH - (innerH * (0 - min)) / (max - min);
    }

    const tickIdx = pickXTickIndices(pts.length, 5);
    const xTicks = tickIdx.map((idx) => {
      const c = coords[idx]!;
      const cx = Math.min(W - PAD_R - 2, Math.max(PAD_L + 2, c.x));
      return {
        x: cx,
        label: formatNavAxisDate(pts[idx]!.date, rangeStart, rangeEnd),
      };
    });

    let costLineY: number | null = null;
    let costPct: number | null = null;
    let costLineClipped = false;
    let costLineTone: CostLineTone | null = null;
    if (usePct && holdingCost != null && holdingCost > 0 && baseNav > 0) {
      costPct = (holdingCost / baseNav - 1) * 100;
      const yRaw = PAD_T + innerH - (innerH * (costPct - min)) / (max - min || 1);
      const plotTop = PAD_T;
      const plotBottom = PAD_T + innerH;
      costLineClipped = yRaw < plotTop - 1 || yRaw > plotBottom + 1;
      costLineY = Math.min(plotBottom, Math.max(plotTop, yRaw));
      const lastNav = pts[pts.length - 1]!.nav;
      if (Number.isFinite(lastNav) && lastNav > 0) {
        if (lastNav > holdingCost) costLineTone = "profit";
        else if (lastNav < holdingCost) costLineTone = "loss";
        else costLineTone = "flat";
      } else {
        costLineTone = "flat";
      }
    }

    return {
      lineD,
      fillD,
      min,
      max,
      yTicks,
      yTickLabels,
      xTicks,
      pointCount: pts.length,
      rangeStart,
      rangeEnd,
      zeroLineY,
      coords,
      usePct,
      innerH,
      nSeg: n,
      costLineY,
      costPct,
      costLineClipped,
      costLineTone,
      fillGradientId,
    };
  }, [data?.points, holdingCost, fillGradientId]);

  function updateHover(clientX: number) {
    const svg = svgRef.current;
    const shell = chartShellRef.current;
    if (!svg || !shell) return;
    const srect = svg.getBoundingClientRect();
    const xSvg = ((clientX - srect.left) / srect.width) * W;
    const idx = indexFromSvgX(xSvg, paths.nSeg);
    if (idx === null) {
      setHoverIdx(null);
      setTipPos(null);
      return;
    }
    setHoverIdx(idx);
    const pt = paths.coords[idx];
    if (!pt) return;
    const wrect = shell.getBoundingClientRect();
    const leftRaw = srect.left + (pt.x / W) * srect.width - wrect.left;
    const topRaw = srect.top + (pt.y / H) * srect.height - wrect.top;
    const padX = 72;
    const clampedLeft = Math.max(padX, Math.min(wrect.width - padX, leftRaw));
    setTipPos({
      left: clampedLeft,
      top: topRaw,
      placeAbove: topRaw > 76,
    });
  }

  const hoverRow = hoverIdx != null ? paths.coords[hoverIdx] : null;

  return (
    <section className="rounded-lg border border-[#dbe5ff] bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <h2 className="text-sm font-semibold text-[#1f2a44]">历史净值走势</h2>
        <p className="max-w-[min(24rem,100%)] text-[10px] leading-snug text-[#8ea1c8]">
          纵轴为相对区间起点涨跌幅；悬停可看日期与涨跌幅
          {holdingCost != null
            ? " · 成本线相对区间起点位置；红=最新净值高于成本（浮盈），绿=低于成本（浮亏）"
            : ""}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {RANGE_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setRange(t.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              range === t.value
                ? "bg-[#1677ff] text-white"
                : "border border-[#dbe5ff] bg-white text-[#5e6f95] hover:bg-[#f5f8ff]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {loading && <p className="mt-2 text-xs text-[#6a7ea8]">加载中…</p>}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {!loading && !error && (data?.points.length ?? 0) < 2 && (
        <p className="mt-2 text-xs text-[#6a7ea8]">该区间净值数据不足，无法绘制曲线。</p>
      )}
      {!loading && !error && data && data.points.length >= 2 && (
        <div ref={chartShellRef} className="relative mt-2 w-full">
          {tipPos && hoverRow && (
            <div
              className="pointer-events-none absolute z-20 min-w-[11rem] max-w-[min(15rem,calc(100%-1rem))] rounded-lg border border-[#dbe5ff] bg-white/95 px-3 py-2 text-xs leading-snug shadow-lg backdrop-blur-[2px]"
              style={{
                left: tipPos.left,
                top: tipPos.top,
                transform: tipPos.placeAbove
                  ? "translate(-50%, calc(-100% - 12px))"
                  : "translate(-50%, 14px)",
              }}
            >
              <p className="whitespace-nowrap font-medium leading-tight text-[#1f2a44]">
                {hoverRow.date}
              </p>
              {paths.usePct && hoverRow.pctFromStart != null ? (
                <>
                  <p className="mt-0.5 text-[#5e6f95]">
                    相对起点{" "}
                    <span className="tabular-nums text-[#1f2a44]">{fmtYAxisPct(hoverRow.pctFromStart)}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#9baccb]">单位净值 {fmtNav(hoverRow.nav)}</p>
                </>
              ) : (
                <p className="mt-0.5 text-[#5e6f95]">
                  单位净值 <span className="tabular-nums text-[#1f2a44]">{fmtNav(hoverRow.nav)}</span>
                </p>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="h-auto min-w-0 w-full max-w-full overflow-visible text-[#8ea1c8]"
              role="img"
              aria-label="基金净值涨跌幅走势图"
            >
            <defs>
              <linearGradient id={paths.fillGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1677ff" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#1677ff" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {/* grid */}
            {paths.yTicks.map((yv, i) => {
              const innerH = H - PAD_T - PAD_B;
              const y =
                PAD_T +
                innerH -
                (innerH * (yv - paths.min)) / (paths.max - paths.min || 1);
              const label = paths.yTickLabels[i] ?? String(yv);
              return (
                <g key={i}>
                  <line
                    x1={PAD_L}
                    y1={y}
                    x2={W - PAD_R}
                    y2={y}
                    stroke="#e8efff"
                    strokeWidth={1}
                  />
                  <text x={4} y={y + 3} fontSize={9} fill="#9baccb">
                    {label}
                  </text>
                </g>
              );
            })}
            {paths.zeroLineY !== null && (
              <line
                x1={PAD_L}
                y1={paths.zeroLineY}
                x2={W - PAD_R}
                y2={paths.zeroLineY}
                stroke="#9baccb"
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.6}
              />
            )}
            <path d={paths.fillD} fill={`url(#${paths.fillGradientId})`} stroke="none" />
            <path
              d={paths.lineD}
              fill="none"
              stroke="#1677ff"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {paths.costLineY != null && paths.costPct != null && paths.costLineTone != null && (
              <g style={{ pointerEvents: "none" }}>
                <line
                  x1={PAD_L}
                  y1={paths.costLineY}
                  x2={W - PAD_R}
                  y2={paths.costLineY}
                  stroke={COST_LINE_STYLE[paths.costLineTone].stroke}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                />
                <text
                  x={PAD_L + 6}
                  y={paths.costLineY + (paths.costLineY < PAD_T + 22 ? 11 : -5)}
                  fontSize={9}
                  fill={COST_LINE_STYLE[paths.costLineTone].fill}
                  textAnchor="start"
                  className="select-none"
                >
                  <tspan fontWeight={600}>成本线</tspan>
                  <tspan>{` ${fmtYAxisPct(paths.costPct)}`}</tspan>
                  {paths.costLineClipped ? <tspan> · 截断</tspan> : null}
                </text>
              </g>
            )}
            {hoverIdx != null && paths.coords[hoverIdx] && (
              <g>
                <line
                  x1={paths.coords[hoverIdx]!.x}
                  y1={PAD_T}
                  x2={paths.coords[hoverIdx]!.x}
                  y2={PAD_T + paths.innerH}
                  stroke="#1677ff"
                  strokeWidth={1}
                  strokeOpacity={0.4}
                  pointerEvents="none"
                />
                <circle
                  cx={paths.coords[hoverIdx]!.x}
                  cy={paths.coords[hoverIdx]!.y}
                  r={4}
                  fill="#fff"
                  stroke="#1677ff"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              </g>
            )}
            {/* x 轴时间刻度 */}
            <line
              x1={PAD_L}
              y1={H - PAD_B + 4}
              x2={W - PAD_R}
              y2={H - PAD_B + 4}
              stroke="#d3def7"
              strokeWidth={1}
            />
            {paths.xTicks.map((t, i) => (
              <text
                key={`${t.label}-${i}`}
                x={t.x}
                y={H - 10}
                fontSize={9}
                fill="#6a7ea8"
                textAnchor="middle"
              >
                {t.label}
              </text>
            ))}
            <rect
              x={PAD_L}
              y={PAD_T}
              width={W - PAD_L - PAD_R}
              height={paths.innerH}
              fill="transparent"
              className="cursor-crosshair touch-none"
              onPointerMove={(e) => updateHover(e.clientX)}
              onPointerDown={(e) => updateHover(e.clientX)}
              onPointerLeave={() => {
                setHoverIdx(null);
                setTipPos(null);
              }}
            />
          </svg>
          </div>
          {paths.pointCount > 0 && (
            <p className="mt-1 text-center text-[11px] text-[#9baccb]">
              {paths.rangeStart} ~ {paths.rangeEnd} · 共 {paths.pointCount} 个交易日
            </p>
          )}
          {data.totalCount > 0 && (
            <p className="mt-0.5 text-center text-[11px] text-[#9baccb]">
              东财披露记录约 {data.totalCount} 条
            </p>
          )}
        </div>
      )}
    </section>
  );
}
