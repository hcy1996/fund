"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

export function UserNav() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (status === "loading") {
    return <span className="text-xs text-[#8ea1c8]">…</span>;
  }

  if (session?.user) {
    const email = session.user.email ?? "";
    return (
      <div ref={rootRef} className="relative text-sm">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex max-w-[12rem] items-center gap-1 rounded-lg px-2 py-1.5 text-left text-[#4d5f87] transition hover:bg-[#f0f6ff] hover:text-[#1677ff]"
          title={email}
        >
          <span className="truncate">{email}</span>
          <svg
            className={`h-4 w-4 shrink-0 text-[#8ea1c8] transition ${open ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1 min-w-[10rem] rounded-xl border border-[#e2ebff] bg-white py-1 shadow-lg shadow-[#1f2a44]/10"
          >
            <Link
              href="/admin"
              role="menuitem"
              className="flex w-full px-3 py-2 text-left text-sm text-[#4d5f87] transition hover:bg-[#f5f8ff] hover:text-[#1677ff]"
              onClick={() => setOpen(false)}
            >
              设置
            </Link>
            <button
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-2 text-left text-sm text-[#4d5f87] transition hover:bg-[#f5f8ff] hover:text-[#1677ff]"
              onClick={() => {
                setOpen(false);
                void signOut({ callbackUrl: "/" });
              }}
            >
              退出登录
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-3 text-sm">
      <Link href="/login" className="rounded-lg px-2 py-1.5 text-[#4d5f87] transition hover:bg-[#f0f6ff] hover:text-[#1677ff]">
        登录
      </Link>
      <Link href="/register" className="rounded-lg px-2 py-1.5 text-[#4d5f87] transition hover:bg-[#f0f6ff] hover:text-[#1677ff]">
        注册
      </Link>
    </div>
  );
}
