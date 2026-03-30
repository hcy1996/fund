"use client";

import { useMemo, useRef, useState } from "react";
import { PERIOD_ORDER, type PkChartRange } from "./pk-shared";

type ChartLegendItem = {
  code: string;
  name: string;
  color: string;
};

type ChartGeom = {
  min: number;
  max: number;
  yTicks: number[];
  lines: { stroke: string; lineD: string }[];
  xTicks: { x: number; label: string }[];
};

type ChartSeries = {
  code: string;
  name: string;
  pct: number[];
  dates: string[];
  stroke: string;
};

type Props = {
  selectedCount: number;
  chartRange: PkChartRange;
  onChartRangeChange: (value: PkChartRange) => void;
  chartLegendItems: ChartLegendItem[];
  chartSeries: ChartSeries[];
  chartError: string | null;
  chartLoading: boolean;
  chartGeom: ChartGeom | null;
  chartReadyText: string;
  chartWidth: number;
  chartHeight: number;
  padLeft: number;
  padRight: number;
};

export function PkChartSection({
  selectedCount,
  chartRange,
  onChartRangeChange,
  chartLegendItems,
  chartSeries,
  chartError,
  chartLoading,
  chartGeom,
  chartReadyText,
  chartWidth,
  chartHeight,
  padLeft,
  padRight,
}: Props) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number; placeAbove: boolean } | null>(null);
  const plotTop = 12;
  const plotBottom = chartHeight - 40;
  const plotHeight = plotBottom - plotTop;

  const hoverSummary = useMemo(() => {
    if (hoverT === null || chartSeries.length === 0 || !chartGeom) return null;

    const referenceSeries = [...chartSeries].sort((left, right) => right.dates.length - left.dates.length)[0];
    if (!referenceSeries) return null;

    const referenceIndex = Math.min(
      referenceSeries.dates.length - 1,
      Math.max(0, Math.round(hoverT * Math.max(0, referenceSeries.dates.length - 1))),
    );
    const date = referenceSeries.dates[referenceIndex] ?? "";
    const hoverX = padLeft + hoverT * (chartWidth - padLeft - padRight);

    const rows = chartSeries
      .map((series) => {
        const pointIndex = Math.min(
          series.pct.length - 1,
          Math.max(0, Math.round(hoverT * Math.max(0, series.pct.length - 1))),
        );
        const pct = series.pct[pointIndex] ?? null;
        const y =
          pct === null
            ? null
            : plotTop +
              plotHeight -
              (plotHeight * (pct - chartGeom!.min)) / (chartGeom!.max - chartGeom!.min || 1);
        return {
          code: series.code,
          name: series.name,
          color: series.stroke,
          pct,
          y,
        };
      })
      .sort((left, right) => {
        if (left.pct === null) return 1;
        if (right.pct === null) return -1;
        return right.pct - left.pct;
      });

    return { date, hoverX, rows };
  }, [chartSeries, chartGeom, chartWidth, hoverT, padLeft, padRight, plotHeight]);

  const endLabels = useMemo(() => {
    if (!chartGeom || chartSeries.length === 0) return [];

    const minGap = 18;
    const minY = plotTop + 10;
    const maxY = plotBottom - 10;
    const items = chartSeries
      .map((series) => {
        const pct = series.pct[series.pct.length - 1];
        if (pct === undefined || Number.isNaN(pct)) return null;

        const y = plotTop + plotHeight - (plotHeight * (pct - chartGeom.min)) / (chartGeom.max - chartGeom.min || 1);
        return {
          code: series.code,
          color: series.stroke,
          y,
          labelY: y,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((left, right) => left.y - right.y) as {
      code: string;
      color: string;
      y: number;
      labelY: number;
    }[];

    items.forEach((item, index) => {
      const minAllowedY = minY + index * minGap;
      const prevY = index > 0 ? items[index - 1]!.labelY + minGap : minY;
      item.labelY = Math.max(item.y, minAllowedY, prevY);
    });

    for (let index = items.length - 1; index >= 0; index -= 1) {
      const maxAllowedY = maxY - (items.length - 1 - index) * minGap;
      const nextY = index < items.length - 1 ? items[index + 1]!.labelY - minGap : maxY;
      items[index]!.labelY = Math.min(items[index]!.labelY, maxAllowedY, nextY);
    }

    return items;
  }, [chartGeom, chartSeries, plotBottom, plotHeight, plotTop]);

  function fmtSignedPct(value: number | null) {
    if (value === null || Number.isNaN(value)) return "—";
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  }

  function updateHover(clientX: number, clientY: number) {
    const svg = svgRef.current;
    const shell = shellRef.current;
    if (!svg || !shell) return;

    const svgRect = svg.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const xSvg = ((clientX - svgRect.left) / svgRect.width) * chartWidth;
    if (xSvg < padLeft || xSvg > chartWidth - padRight) {
      setHoverT(null);
      setTipPos(null);
      return;
    }

    const innerWidth = chartWidth - padLeft - padRight;
    const t = (xSvg - padLeft) / innerWidth;
    const leftRaw = clientX - shellRect.left;
    const topRaw = clientY - shellRect.top;
    const padX = 88;
    const clampedLeft = Math.max(padX, Math.min(shellRect.width - padX, leftRaw));

    setHoverT(Math.max(0, Math.min(1, t)));
    setTipPos({
      left: clampedLeft,
      top: topRaw,
      placeAbove: topRaw > 84,
    });
  }

  return (
    <section className="rounded-lg border border-[#dbe5ff] bg-white p-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#1f2a44]">收益曲线</h2>
          <p className="mt-0.5 text-[10px] text-[#7287b0]">纵轴为相对区间起点涨跌幅，右侧显示当前点位，悬浮查看明细</p>
        </div>
        <div className="text-[10px] text-[#8ea1c8]">{chartReadyText}</div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {PERIOD_ORDER.map((period) => (
          <button
            key={period.key}
            type="button"
            onClick={() => onChartRangeChange(period.key)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              chartRange === period.key
                ? "bg-[#1677ff] text-white"
                : "border border-[#dbe5ff] bg-white text-[#5e6f95] hover:bg-[#f5f8ff]"
            }`}
          >
            {period.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {chartLegendItems.map((item) => (
          <div
            key={item.code}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-[#4f628b]"
            style={{
              borderColor: `${item.color}33`,
              backgroundColor: `${item.color}12`,
            }}
          >
            <span className="h-2 w-2 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.7)]" style={{ background: item.color }} />
            <span className="font-mono tabular-nums" style={{ color: item.color }}>
              {item.code}
            </span>
            {item.name && <span className="max-w-32 truncate">{item.name}</span>}
          </div>
        ))}
      </div>

      {chartError && <p className="mt-2 text-xs text-red-500">{chartError}</p>}
      {chartLoading && <p className="mt-2 text-xs text-[#6a7ea8]">加载曲线中…</p>}

      {!chartLoading && !chartError && chartGeom && (
        <div ref={shellRef} className="relative mt-2 w-full">
          {tipPos && hoverSummary && (
            <div
              className="pointer-events-none absolute z-20 min-w-[13rem] max-w-[min(18rem,calc(100%-1rem))] rounded-lg border border-[#dbe5ff] bg-white/95 px-3 py-2 text-xs leading-snug shadow-lg backdrop-blur-[2px]"
              style={{
                left: tipPos.left,
                top: tipPos.top,
                transform: tipPos.placeAbove
                  ? "translate(-50%, calc(-100% - 12px))"
                  : "translate(-50%, 14px)",
              }}
            >
              <p className="whitespace-nowrap font-medium leading-tight text-[#1f2a44]">
                {hoverSummary.date || "—"}
              </p>
              <div className="mt-1.5 space-y-1">
                {hoverSummary.rows.map((row) => (
                  <div key={row.code} className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-1.5 text-[#5e6f95]">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: row.color }} />
                      <span className="truncate text-[#1f2a44]">{row.name || row.code}</span>
                      <span className="shrink-0 font-mono tabular-nums text-[#8ea1c8]">{row.code}</span>
                    </div>
                    <span className="shrink-0 tabular-nums text-[#1f2a44]">
                      {fmtSignedPct(row.pct)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="h-auto min-w-[640px] w-full"
              role="img"
              aria-label="收益曲线（相对区间起点涨跌幅）"
              onMouseMove={(event) => updateHover(event.clientX, event.clientY)}
              onMouseLeave={() => {
                setHoverT(null);
                setTipPos(null);
              }}
            >
              {chartGeom.yTicks.map((value, index) => {
                const y =
                  plotTop +
                  plotHeight -
                  (plotHeight * (value - chartGeom.min)) / (chartGeom.max - chartGeom.min || 1);

                return (
                  <g key={index}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={chartWidth - padRight}
                      y2={y}
                      stroke="#d8e5ff"
                      strokeWidth={1}
                    />
                    <text x={4} y={y + 3} fontSize={9} fill="#7f93b9" fontWeight={500}>
                      {value >= 0 ? "+" : ""}
                      {value.toFixed(2)}%
                    </text>
                  </g>
                );
              })}

              <g>
                {chartGeom.lines.map((line, index) => (
                  <path
                    key={index}
                    d={line.lineD}
                    fill="none"
                    stroke={line.stroke}
                    strokeWidth={1.2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
              </g>

              <g pointerEvents="none">
                {endLabels.map((item) => (
                  <g key={item.code}>
                    <line
                      x1={chartWidth - padRight}
                      y1={item.y}
                      x2={chartWidth - padRight - 42}
                      y2={item.labelY}
                      stroke={item.color}
                      strokeWidth={1.5}
                      strokeOpacity={0.5}
                    />
                    <circle
                      cx={chartWidth - padRight}
                      cy={item.y}
                      r={4}
                      fill="#fff"
                      stroke={item.color}
                      strokeWidth={2}
                    />
                    <rect
                      x={chartWidth - padRight - 76}
                      y={item.labelY - 9}
                      width={68}
                      height={18}
                      rx={9}
                      fill={item.color}
                      fillOpacity={0.12}
                      stroke={item.color}
                      strokeOpacity={0.28}
                    />
                    <text
                      x={chartWidth - padRight - 42}
                      y={item.labelY + 3}
                      fontSize={9}
                      fontWeight={700}
                      fill={item.color}
                      textAnchor="middle"
                    >
                      {item.code}
                    </text>
                  </g>
                ))}
              </g>

              {hoverSummary && (
                <g pointerEvents="none">
                  <line
                    x1={hoverSummary.hoverX}
                    y1={plotTop}
                    x2={hoverSummary.hoverX}
                    y2={plotBottom}
                    stroke="#1677ff"
                    strokeWidth={1}
                    strokeOpacity={0.45}
                    strokeDasharray="4 4"
                  />
                  {hoverSummary.rows.map(
                    (row) =>
                      row.y !== null && (
                        <circle
                          key={row.code}
                          cx={hoverSummary.hoverX}
                          cy={row.y}
                          r={4}
                          fill="#fff"
                          stroke={row.color}
                          strokeWidth={2}
                        />
                      ),
                  )}
                </g>
              )}

              {chartGeom.xTicks.map((tick, index) => (
                <text
                  key={index}
                  x={tick.x}
                  y={chartHeight - 14}
                  fontSize={9}
                  fill="#7f93b9"
                  fontWeight={500}
                  textAnchor="middle"
                >
                  {tick.label}
                </text>
              ))}
            </svg>
          </div>
        </div>
      )}

      {!chartLoading && !chartError && !chartGeom && selectedCount > 0 && (
        <p className="mt-2 text-xs text-[#6a7ea8]">该区间净值数据不足，无法绘制曲线。</p>
      )}
    </section>
  );
}
