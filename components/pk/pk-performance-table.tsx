"use client";

import { getPkGridMinWidth, getPkGridTemplate, PERIOD_ORDER, type PkFund } from "./pk-shared";

function fmtSignedPct(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function PctCell({
  pct,
  winner,
  color,
}: {
  pct: number | null;
  winner: boolean;
  color: string;
}) {
  return (
    <div className="flex items-center justify-center px-2 py-3">
      <span className={`relative inline-flex items-center ${winner ? "pr-5" : ""}`}>
        {winner && (
          <span className="pointer-events-none absolute right-0 top-[-10px] rounded-sm bg-[#ff5f6d] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            优
          </span>
        )}
        <span className="text-[16px] font-semibold leading-none tabular-nums" style={{ color }}>
          {fmtSignedPct(pct)}
        </span>
      </span>
    </div>
  );
}

type Props = {
  selected: string[];
  fundsByCode: Record<string, PkFund>;
  winnerByPeriod: Map<string, number>;
};

export function PkPerformanceTable({ selected, fundsByCode, winnerByPeriod }: Props) {
  if (selected.length < 1) return null;

  return (
    <section className="rounded-lg border border-[#dbe5ff] bg-white p-2 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#1f2a44]">收益表现</h2>
        <p className="text-[10px] text-[#8ea1c8]">并列最高都标「优」</p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <div
          className="w-full rounded-2xl border border-[#e8efff] bg-white"
          style={{ minWidth: `${getPkGridMinWidth(selected.length)}px` }}
        >
          {PERIOD_ORDER.map((period, rowIndex) => {
            const max = winnerByPeriod.get(period.key);

            return (
              <div
                key={period.key}
                className={`grid items-stretch ${
                  rowIndex < PERIOD_ORDER.length - 1 ? "border-b border-[#e8efff]" : ""
                }`}
                style={{ gridTemplateColumns: getPkGridTemplate(selected.length) }}
              >
                <div className="flex items-center border-r border-[#e8efff] bg-[#f9fbff] px-4 py-3 text-xs font-semibold text-[#1f2a44]">
                  {period.label}
                </div>
                {selected.map((code, index) => {
                  const fund = fundsByCode[code];
                  const row = fund?.periods.find((item) => item.key === period.key);
                  const pct = row?.pct ?? null;
                  const winner = pct !== null && max !== undefined && pct === max;
                  const color = pct === null ? "#9baccb" : pct >= 0 ? "#ff5f6d" : "#00d26a";

                  return (
                    <div
                      key={`${code}${period.key}`}
                      className={index > 0 ? "border-l border-[#e8efff]" : ""}
                    >
                      <PctCell pct={pct} winner={winner} color={color} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
