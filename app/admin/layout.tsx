"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isFundCategoriesActive = pathname === "/admin/fund-categories";
  const isAccountsActive = pathname === "/admin/accounts";

  return (
    <div className="flex gap-4">
      <aside className="w-56 shrink-0">
        <div className="rounded-lg border border-[#dbe5ff] bg-white p-3 shadow-sm">
          <div className="px-1 pb-2 text-xs font-medium text-[#8ea1c8]">目录</div>
          <nav className="space-y-1">
            <Link
              href="/admin/fund-categories"
              className={`block rounded-md px-2.5 py-2 text-sm transition ${
                isFundCategoriesActive
                  ? "bg-[#eaf4ff] text-[#1677ff]"
                  : "text-[#4d5f87] hover:bg-[#f5f8ff] hover:text-[#1677ff]"
              }`}
            >
              分类管理
            </Link>
            <Link
              href="/admin/accounts"
              className={`block rounded-md px-2.5 py-2 text-sm transition ${
                isAccountsActive
                  ? "bg-[#eaf4ff] text-[#1677ff]"
                  : "text-[#4d5f87] hover:bg-[#f5f8ff] hover:text-[#1677ff]"
              }`}
            >
              账户管理
            </Link>
          </nav>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

