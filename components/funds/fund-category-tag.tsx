"use client";

import { useEffect, useState } from "react";
import { FundCategoryDrawer } from "@/components/funds/fund-category-drawer";

type Props = {
  fundCode: string;
  initialCategoryId?: string | null;
  initialLabel?: string | null;
};

type ApiRes = { categoryId: string | null; label: string | null };

export function FundCategoryTag({ fundCode, initialCategoryId = null, initialLabel = null }: Props) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [label, setLabel] = useState<string | null>(initialLabel);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/funds/category?code=${encodeURIComponent(fundCode)}`);
        if (!res.ok) return;
        const data = (await res.json()) as ApiRes;
        if (cancelled) return;
        setCategoryId(data.categoryId);
        setLabel(data.label);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fundCode]);

  return (
    <>
      {label ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-[#dbe5ff] bg-[#f9fbff] px-2.5 py-1 text-[11px] font-medium text-[#5e6f95] hover:bg-[#f5f8ff] flex items-center gap-1"
        >
          <span className="text-[#1f2a44]">{label}</span>
          {loading ? <span className="text-[#9baccb]">…</span> : <span className="text-[#9baccb]">修改</span>}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-[#dbe5ff] bg-white px-2 py-1 text-[11px] font-medium text-[#5e6f95] hover:bg-[#f5f8ff]"
        >
          设置分类
        </button>
      )}

      <FundCategoryDrawer
        open={open}
        onClose={() => setOpen(false)}
        fundCode={fundCode}
        currentCategoryId={categoryId}
        onSaved={(nextCategoryId) => {
          setCategoryId(nextCategoryId);
          // 取一次 label 保证大/小类显示一致
          void (async () => {
            try {
              const res = await fetch(`/api/funds/category?code=${encodeURIComponent(fundCode)}`);
              if (!res.ok) return;
              const data = (await res.json()) as ApiRes;
              setLabel(data.label);
            } catch {
              setLabel(null);
            }
          })();
        }}
      />
    </>
  );
}

