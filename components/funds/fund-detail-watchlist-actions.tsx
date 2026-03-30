"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { WatchlistGroupDrawer } from "@/components/watchlist/watchlist-group-drawer";

type Props = { fundCode: string; fundName: string };

/** 详情页顶部：自选分组入口 */
export function FundDetailWatchlistActions({ fundCode, fundName }: Props) {
  const { data: session } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!session?.user) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="shrink-0 rounded-lg border border-[#1677ff] bg-[#eaf4ff] px-3 py-1.5 text-xs font-medium text-[#1677ff] hover:bg-[#d9e8ff] sm:text-sm"
      >
        自选分组
      </button>
      <WatchlistGroupDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        fundCode={fundCode}
        fundName={fundName}
      />
    </>
  );
}
