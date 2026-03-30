"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { WatchlistGroupDrawer } from "@/components/watchlist/watchlist-group-drawer";
import { getPkGridMinWidth, getPkGridTemplate, type FundSearchHit, type PkFund } from "./pk-shared";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  historyHits?: FundSearchHit[];
  suggestions: FundSearchHit[];
  suggesting: boolean;
  suggestionError: string | null;
  onAddCode: (code: string, name?: string) => void | Promise<void>;
  onDeleteHistoryItem?: (code: string) => void;
  sessionUserId?: string | null;
  selected: string[];
  fundsByCode: Record<string, PkFund>;
  onRemoveSelected: (code: string) => void;
};

function RemoveIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.14" />
      <path
        d="M6.5 6.5L13.5 13.5M13.5 6.5L6.5 13.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AddWatchlistIcon({ disabled }: { disabled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.8"
        opacity={disabled ? 0.5 : 1}
      />
      <path
        d="M12 8.25V15.75M8.25 12H15.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DeleteSmallIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M6.5 6.5L13.5 13.5M13.5 6.5L6.5 13.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PkSelectionPanel({
  query,
  onQueryChange,
  historyHits,
  suggestions,
  suggesting,
  suggestionError,
  onAddCode,
  onDeleteHistoryItem,
  sessionUserId,
  selected,
  fundsByCode,
  onRemoveSelected,
}: Props) {
  const [drawerFundCode, setDrawerFundCode] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const blurTimerRef = useRef<number | null>(null);
  const focusSeqRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const drawerFund = drawerFundCode ? fundsByCode[drawerFundCode] : undefined;

  return (
    <>
      <div className="rounded-lg border border-[#dbe5ff] bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="w-full max-w-[24rem]">
            <div className="relative">
              <div className="flex items-stretch gap-2">
                <input
                  ref={inputRef}
                  className="flex-1 rounded-xl border border-[#dbe5ff] bg-[#f8fbff] px-4 py-3 text-sm text-[#1f2a44] outline-none transition focus:ring-2 focus:ring-[#1677ff]/25"
                  placeholder="输入基金代码/名称"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  onMouseDown={() => {
                    // 如果上一次通过下拉选项导致输入仍保持聚焦，则再次点击输入不会触发 onFocus。
                    // 用 onMouseDown 强制把下拉打开，保证交互一致。
                    if (!isFocused) setIsFocused(true);
                  }}
                  onClick={() => {
                    // 某些情况下只点击输入（仍保持 focus）不会触发 onFocus；
                    // 用 onClick 再兜底打开下拉。
                    if (!isFocused) setIsFocused(true);
                  }}
                  onFocus={() => {
                    // 取消上一次失焦的延迟关闭，避免“旧 blur 计时器”在重新 focus 后又把下拉关掉
                    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                    blurTimerRef.current = null;
                    focusSeqRef.current += 1;
                    setIsFocused(true);
                  }}
                  onBlur={() => {
                    // 延迟收起，避免点击下拉时 blur 先发生导致点击失败
                    const seq = focusSeqRef.current;
                    blurTimerRef.current = window.setTimeout(() => {
                      if (focusSeqRef.current === seq) setIsFocused(false);
                    }, 150);
                  }}
                />

                {query.trim() !== "" && (
                  <button
                    type="button"
                    onClick={() => {
                      onQueryChange("");
                      setIsFocused(false);
                      inputRef.current?.blur();
                    }}
                    className="shrink-0 rounded-xl border border-[#dbe5ff] bg-white px-3 py-2 text-xs font-medium text-[#7b8fb7] transition hover:bg-[#f5f8ff]"
                  >
                    清除
                  </button>
                )}
              </div>
              {isFocused &&
              ((query.trim() === "" && (historyHits?.length ?? 0) > 0) || suggestions.length > 0 || suggesting || suggestionError) ? (
                <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-56 overflow-auto rounded-2xl border border-[#e2ebff] bg-white shadow-lg">
                  {query.trim() === "" && (historyHits?.length ?? 0) > 0 && (
                    <div className="px-4 py-2 text-[11px] text-[#8ea1c8]">最近搜索</div>
                  )}
                  {query.trim() === "" &&
                    (historyHits ?? []).map((item) => (
                    <button
                      key={`history-${item.code}`}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs hover:bg-[#f5f9ff]"
                      onClick={() => {
                        setIsFocused(false);
                        // 允许输入在点击后真正失焦；避免“二次 focus 不触发”的交互问题
                        inputRef.current?.blur();
                        void onAddCode(item.code, item.name);
                      }}
                    >
                      <span className="min-w-0 truncate text-[#1f2a44]">
                        <span className="font-mono tabular-nums text-[#1677ff]">{item.code}</span>
                        {item.name && item.name !== item.code ? (
                          <span className="ml-2 truncate text-[#4d5f87]">{item.name}</span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[#8ea1c8]">添加</span>
                        {onDeleteHistoryItem ? (
                          <span
                            role="button"
                            tabIndex={-1}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#8ea1c8] transition hover:bg-[#f5f9ff] hover:text-[#5e6f95]"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
                              blurTimerRef.current = null;
                              onDeleteHistoryItem(item.code);
                              setIsFocused(true);
                              inputRef.current?.focus();
                            }}
                            aria-label={`删除 ${item.code} 的搜索记录`}
                            title="删除"
                          >
                            <DeleteSmallIcon />
                          </span>
                        ) : null}
                      </span>
                    </button>
                    ))}
                  {suggestions.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs hover:bg-[#f5f9ff]"
                      onClick={() => {
                        setIsFocused(false);
                        // 允许输入在点击后真正失焦
                        inputRef.current?.blur();
                        void onAddCode(item.code, item.name);
                      }}
                    >
                      <span className="min-w-0 truncate text-[#1f2a44]">
                        <span className="font-mono tabular-nums text-[#1677ff]">{item.code}</span>
                        {item.name && item.name !== item.code ? (
                          <span className="ml-2 truncate text-[#4d5f87]">{item.name}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[#8ea1c8]">添加</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {suggesting && <p className="mt-2 text-[11px] text-[#8ea1c8]">搜索中…</p>}
            {suggestionError && <p className="mt-2 text-[11px] text-red-500">{suggestionError}</p>}
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <div className="sticky top-14 z-20 bg-white">
            <div
              className="grid rounded-2xl border border-[#e8efff] bg-white"
              style={{
                gridTemplateColumns: getPkGridTemplate(selected.length),
                minWidth: `${getPkGridMinWidth(selected.length)}px`,
              }}
            >
              <div className="flex min-h-[112px] items-center border-r border-[#e8efff] bg-white px-4 py-3">
              <div>
                <p className="text-xl font-semibold tracking-[0.02em] text-[#1f2a44]">基金名称</p>
                <p className="mt-3 text-[10px] leading-6 text-[#9aaed4]">
                  最多 5 只基金对比
                </p>
              </div>
              </div>

              {selected.length < 1 ? (
                <div className="flex min-h-[112px] items-center justify-center bg-[#fbfcff] px-4 text-sm text-[#8ea1c8]">
                  添加基金后在这里展示对比卡片
                </div>
              ) : (
                selected.map((code, index) => {
                  const fund = fundsByCode[code];
                  const canOpenWatchlistDrawer = !!sessionUserId;

                  return (
                    <div
                      key={code}
                      className={`bg-white p-2.5 ${index > 0 ? "border-l border-[#e8efff]" : ""}`}
                    >
                      <div className="relative h-[116px] rounded-[18px] bg-[#f3f6ff] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(223,233,255,0.95)]">
                        <button
                          type="button"
                          className="absolute right-2 top-2 text-[#b7c1d8] transition hover:text-[#7f8ca8]"
                          onClick={() => onRemoveSelected(code)}
                          aria-label={`移除 ${code}`}
                          title="移除"
                        >
                          <RemoveIcon />
                        </button>

                        <div className="min-w-0 pr-10">
                          <Link
                            href={`/funds/${encodeURIComponent(code)}`}
                            className="block max-h-[42px] overflow-hidden text-[15px] font-semibold leading-[1.4] text-[#1677ff] transition hover:text-[#1677ff] hover:underline"
                            title={`查看 ${fund?.name || code} 详情`}
                          >
                            {fund?.name || code}
                          </Link>
                          <p className="absolute bottom-6 left-4 text-[11px] font-mono tabular-nums text-[#7f8ca8]">
                            {code}
                          </p>
                        </div>

                        <button
                          type="button"
                          className={`absolute bottom-2.5 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full ${
                            canOpenWatchlistDrawer
                              ? "text-[#6a96ff] transition hover:bg-white/80 hover:text-[#1677ff]"
                              : "cursor-not-allowed text-[#b7c1d8]"
                          }`}
                          disabled={!canOpenWatchlistDrawer}
                          onClick={() => setDrawerFundCode(code)}
                          aria-label={`加入自选：${code}`}
                          title={sessionUserId ? "选择自选分组" : "登录后加入自选"}
                        >
                          <AddWatchlistIcon disabled={!canOpenWatchlistDrawer} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {sessionUserId && drawerFundCode && (
        <WatchlistGroupDrawer
          open
          onClose={() => setDrawerFundCode(null)}
          fundCode={drawerFundCode}
          fundName={drawerFund?.name ?? drawerFundCode}
        />
      )}
    </>
  );
}
