"use client";

import Link from "next/link";
import type { PkFund } from "./pk-shared";

function fmtPct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

type Props = {
  loading: boolean;
  error: string | null;
  selected: string[];
  fundsByCode: Record<string, PkFund>;
};

export function PkHoldingsSection({
  loading,
  error,
  selected,
  fundsByCode,
}: Props) {
  return (
    <section className="rounded-lg border border-[#dbe5ff] bg-white p-2 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#1f2a44]">基金持仓股票</h2>
        <p className="text-[10px] text-[#8ea1c8]">展示基金最新披露的重仓股（通常前 10）</p>
      </div>

      {loading ? (
        <p className="mt-2 text-xs text-[#6a7ea8]">加载中…</p>
      ) : error ? (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {selected.map((code) => {
            const fund = fundsByCode[code];
            const items = fund?.holdingsStocks ?? [];

            return (
              <div key={code} className="rounded-lg border border-[#e8efff] bg-white p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/funds/${encodeURIComponent(code)}`}
                      className="block truncate text-[13px] font-medium text-[#1f2a44] transition hover:text-[#1677ff] hover:underline"
                      title={`查看 ${fund?.name || code} 详情`}
                    >
                      {fund?.name || code}
                    </Link>
                    <p className="font-mono text-[10px] text-[#9baccb]">{code}</p>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-[#8ea1c8]">{fund?.holdingsTitle || "最近披露持仓"}</p>

                {items.length === 0 ? (
                  <p className="mt-2 text-xs text-[#6a7ea8]">暂无公布持仓股票</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {items.map((it, idx) => (
                      <li key={`${it.code}-${idx}`} className="flex items-center justify-between gap-2 text-[11px]">
                        <div className="min-w-0">
                          <span className="text-[#9baccb]">{idx + 1}. </span>
                          <span className="truncate text-[#1f2a44]">{it.name}</span>
                          <span className="ml-1 font-mono text-[10px] text-[#9baccb]">{it.code}</span>
                        </div>
                        <span className="shrink-0 text-[#5e6f95]">{fmtPct(it.weightPct)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
