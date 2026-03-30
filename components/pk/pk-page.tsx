"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { normalizePkSelectedCodes, readPkSelectedCodes, writePkSelectedCodes } from "@/lib/pkStorage";
import { deleteFundSearchHistoryEntry, readFundSearchHistory, recordFundSearchHistory } from "@/lib/fundSearchHistory";
import type { FundNavHistoryDto, FundNavHistoryRange } from "@/types/fund";
import { PkChartSection } from "./pk-chart-section";
import {
  CHART_H,
  CHART_W,
  PAD_L,
  PAD_R,
  PAD_T,
  PAD_B,
  formatAxisDate,
  getChartStroke,
  pickXTickIndices,
} from "./pk-chart-utils";
import { PkHoldingsSection } from "./pk-holdings-section";
import { PkPerformanceTable } from "./pk-performance-table";
import { PkSelectionPanel } from "./pk-selection-panel";
import { PERIOD_ORDER, type FundSearchHit, type PkChartRange, type PkFund } from "./pk-shared";

const LOCAL_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const HOT_WEIGHT = 0.7;
const LOCAL_WEIGHT = 0.3;

export function PkPage() {
  const searchParams = useSearchParams();
  const prefillFundCode = searchParams.get("fundCode")?.trim() ?? "";
  const { data: session } = useSession();
  const scopeUserId = session?.user?.id ?? null;
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<FundSearchHit[]>([]);
  const [historyHits, setHistoryHits] = useState<FundSearchHit[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [funds, setFunds] = useState<PkFund[]>([]);
  const [selectedReady, setSelectedReady] = useState(false);
  const [chartRange, setChartRange] = useState<PkChartRange>("3m");
  const [navHistoryByCode, setNavHistoryByCode] = useState<Record<string, FundNavHistoryDto>>({});
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(readPkSelectedCodes());
    setSelectedReady(true);
  }, []);

  const fundsByCode = useMemo(() => {
    const next: Record<string, PkFund> = {};
    for (const fund of funds) {
      next[fund.code] = fund;
    }
    return next;
  }, [funds]);

  const loadHistoryHits = useCallback(() => {
    const localEntries = readFundSearchHistory(scopeUserId);
    const top = localEntries.slice(0, 10).map((x) => ({
      code: x.code,
      // 历史记录可能只保存了 code；这里不再用 code 回填为 name，避免 UI 显示成 `code code`
      name: x.name ?? "",
    }));
    setHistoryHits(top);
  }, [scopeUserId]);

  const deleteHistoryItem = useCallback(
    (code: string) => {
      deleteFundSearchHistoryEntry(scopeUserId, code);
      loadHistoryHits();
    },
    [loadHistoryHits, scopeUserId],
  );

  useEffect(() => {
    loadHistoryHits();
  }, [loadHistoryHits]);

  const addCode = useCallback(async (codeRaw: string, fundName?: string) => {
    const code = codeRaw.trim();
    if (!code) return;
    if (selected.includes(code)) return;
    if (selected.length >= 5) {
      alert("最多可对比 5 只基金");
      return;
    }

    recordFundSearchHistory(scopeUserId, code, fundName);
    void fetch("/api/funds/search/hit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fundCode: code }),
    }).catch(() => undefined);

    setSelected((current) => [...current, code]);
    loadHistoryHits();

    setQuery("");
    setSuggestions([]);
    setSuggestionError(null);
  }, [loadHistoryHits, selected, scopeUserId]);

  const removeSelectedCode = useCallback(
    (code: string) => {
      const fund = fundsByCode[code];
      const label = fund?.name ? `${fund.name}（${code}）` : code;
      if (!window.confirm(`确认移除 ${label}？`)) return;

      setSelected((current) => current.filter((item) => item !== code));
    },
    [fundsByCode],
  );

  useEffect(() => {
    if (!selectedReady) return;
    if (!prefillFundCode || !/^\d{6}$/.test(prefillFundCode)) return;
    if (selected.includes(prefillFundCode)) return;

    recordFundSearchHistory(scopeUserId, prefillFundCode);
    void fetch("/api/funds/search/hit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fundCode: prefillFundCode }),
    }).catch(() => undefined);

    setSelected((current) => normalizePkSelectedCodes([...current, prefillFundCode]));
  }, [prefillFundCode, selectedReady, selected, scopeUserId]);

  useEffect(() => {
    if (!selectedReady) return;
    writePkSelectedCodes(selected);
  }, [selected, selectedReady]);

  const fetchSuggestions = useCallback(async (keywordRaw: string) => {
    const keyword = keywordRaw.trim();
    if (!keyword) {
      setSuggestions([]);
      setSuggestionError(null);
      return;
    }
    setSuggesting(true);
    setSuggestionError(null);
    try {
      const response = await fetch(`/api/funds/search?q=${encodeURIComponent(keyword)}`);
      if (!response.ok) {
        setSuggestions([]);
        setSuggestionError("搜索失败");
        return;
      }
      const data = (await response.json()) as FundSearchHit[];
      const localEntries = readFundSearchHistory(scopeUserId);
      const localMap: Record<string, { count: number; lastAt: number }> = {};
      for (const it of localEntries) localMap[it.code] = { count: it.count, lastAt: it.lastAt };
      const recentCodes = new Set(localEntries.slice(0, 10).map((x) => x.code));

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

      setSuggestions(ranked.slice(0, 8).filter((it) => !recentCodes.has(it.code)));
    } catch {
      setSuggestions([]);
      setSuggestionError("网络错误");
    } finally {
      setSuggesting(false);
    }
  }, [scopeUserId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchSuggestions(query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fetchSuggestions, query]);

  useEffect(() => {
    if (selected.length < 1) {
      setFunds([]);
      setError(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/pk/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codes: selected }),
        });

        if (!response.ok) {
          const result = (await response.json().catch(() => ({}))) as { error?: unknown };
          throw new Error(typeof result.error === "string" ? result.error : "对比失败");
        }

        const result = (await response.json()) as { funds: PkFund[] };
        if (!cancelled) setFunds(result.funds ?? []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "对比失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const winnerByPeriod = useMemo(() => {
    const winners = new Map<string, number>();

    for (const period of PERIOD_ORDER) {
      let maxValue: number | null = null;

      for (const fund of funds) {
        const matchedPeriod = fund.periods.find((item) => item.key === period.key);
        if (!matchedPeriod || matchedPeriod.pct === null) continue;
        if (maxValue === null || matchedPeriod.pct > maxValue) maxValue = matchedPeriod.pct;
      }

      if (maxValue !== null) winners.set(period.key, maxValue);
    }

    return winners;
  }, [funds]);

  useEffect(() => {
    if (selected.length < 1) {
      setNavHistoryByCode({});
      return;
    }

    let cancelled = false;

    async function load() {
      setChartLoading(true);
      setChartError(null);

      try {
        const apiRange = (chartRange === "1w" ? "1m" : chartRange) as FundNavHistoryRange;
        const results = await Promise.all(
          selected.map(async (code) => {
            const response = await fetch(
              `/api/funds/nav-history?code=${encodeURIComponent(code)}&range=${encodeURIComponent(apiRange)}`,
            );
            if (!response.ok) throw new Error(`加载 ${code} 失败`);

            const data = (await response.json()) as FundNavHistoryDto;
            if (chartRange !== "1w") return { code, data };

            const points = data.points ?? [];
            if (points.length < 2) return { code, data };

            const lastDate = points[points.length - 1]!.date;
            const startMs = Date.parse(lastDate) - 7 * 24 * 60 * 60 * 1000;
            return {
              code,
              data: {
                ...data,
                points: points.filter((point) => Date.parse(point.date) >= startMs),
                range: apiRange,
              },
            };
          }),
        );

        if (cancelled) return;

        const next: Record<string, FundNavHistoryDto> = {};
        for (const item of results) {
          next[item.code] = item.data;
        }
        setNavHistoryByCode(next);
      } catch (cause) {
        if (!cancelled) setChartError(cause instanceof Error ? cause.message : "曲线加载失败");
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [chartRange, selected]);

  const chartSeries = useMemo(() => {
    return selected
      .map((code, index) => {
        const history = navHistoryByCode[code];
        const points = history?.points ?? [];
        if (points.length < 2) return null;

        const baseNav = points[0]?.nav;
        if (!Number.isFinite(baseNav) || baseNav <= 0) return null;

        return {
          code,
          name: fundsByCode[code]?.name ?? "",
          pct: points.map((point) => (point.nav / baseNav - 1) * 100),
          dates: points.map((point) => point.date),
          stroke: getChartStroke(index),
        };
      })
      .filter(Boolean) as {
        code: string;
        name: string;
        pct: number[];
        dates: string[];
        stroke: string;
      }[];
  }, [fundsByCode, navHistoryByCode, selected]);

  const chartGeom = useMemo(() => {
    if (chartSeries.length === 0) return null;

    const values = chartSeries.flatMap((series) => series.pct);
    if (values.length === 0) return null;

    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const rangePadding = Math.max((rawMax - rawMin) * 0.08, 0.2);
    const min = rawMin - rangePadding;
    const max = rawMax + rangePadding;

    const innerWidth = CHART_W - PAD_L - PAD_R;
    const innerHeight = CHART_H - PAD_T - PAD_B;
    const yTicks = Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4);

    const referenceLength = Math.max(...chartSeries.map((series) => series.pct.length));
    const tickIndices = pickXTickIndices(referenceLength, 4);
    const referenceDates = chartSeries[0]?.dates ?? [];

    const yOf = (value: number) =>
      PAD_T + innerHeight - (innerHeight * (value - min)) / (max - min || 1);

    const lines = chartSeries.map((series) => {
      const lastIndex = series.pct.length - 1;
      const coords = series.pct.map((value, index) => ({
        x: PAD_L + (innerWidth * index) / Math.max(1, lastIndex),
        y: yOf(value),
      }));

      return {
        stroke: series.stroke,
        lineD: coords
          .map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`)
          .join(" "),
      };
    });

    const xTicks = tickIndices.map((index) => {
      const dateIndex = Math.min(referenceDates.length - 1, index);
      const date = referenceDates[dateIndex];
      return {
        x: PAD_L + (innerWidth * index) / Math.max(1, referenceLength - 1),
        label: date ? formatAxisDate(date) : "",
      };
    });

    return { min, max, yTicks, lines, xTicks };
  }, [chartSeries]);

  const chartLegendItems = useMemo(
    () =>
      selected.map((code, index) => ({
        code,
        name: fundsByCode[code]?.name ?? "",
        color: getChartStroke(index),
      })),
    [fundsByCode, selected],
  );

  const chartReadyText =
    selected[0] && navHistoryByCode[selected[0]] ? (chartLoading ? "加载中" : "") : "";

  return (
    <div className="space-y-2">
      <section className="rounded-lg border border-[#dbe5ff] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-sm text-[#1677ff] hover:underline">
              ← 返回首页
            </Link>
            <h1 className="text-lg font-bold text-[#1f2a44]">基金对比 PK</h1>
          </div>
        </div>
      </section>

      <PkSelectionPanel
        query={query}
        onQueryChange={setQuery}
        historyHits={historyHits}
        suggestions={suggestions}
        suggesting={suggesting}
        suggestionError={suggestionError}
        onAddCode={addCode}
        onDeleteHistoryItem={deleteHistoryItem}
        sessionUserId={session?.user?.id}
        selected={selected}
        fundsByCode={fundsByCode}
        onRemoveSelected={removeSelectedCode}
      />

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && selected.length >= 1 && <p className="text-xs text-[#6a7ea8]">计算中…</p>}

      {selected.length < 1 ? null : (
        <div className="space-y-1.5">
          <PkChartSection
            selectedCount={selected.length}
            chartRange={chartRange}
            onChartRangeChange={setChartRange}
            chartLegendItems={chartLegendItems}
            chartSeries={chartSeries}
            chartError={chartError}
            chartLoading={chartLoading}
            chartGeom={chartGeom}
            chartReadyText={chartReadyText}
            chartWidth={CHART_W}
            chartHeight={CHART_H}
            padLeft={PAD_L}
            padRight={PAD_R}
          />

          <PkPerformanceTable
            selected={selected}
            fundsByCode={fundsByCode}
            winnerByPeriod={winnerByPeriod}
          />

          <PkHoldingsSection
            loading={loading}
            error={error}
            selected={selected}
            fundsByCode={fundsByCode}
          />
        </div>
      )}
    </div>
  );
}
