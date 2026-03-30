"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type MessageType = "success" | "error" | "info";

type MessageItem = {
  id: string;
  type: MessageType;
  content: string;
};

type MessageApi = {
  success: (content: string, durationMs?: number) => void;
  error: (content: string, durationMs?: number) => void;
  info: (content: string, durationMs?: number) => void;
};

const MessageContext = createContext<MessageApi | null>(null);

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getColor(type: MessageType) {
  switch (type) {
    case "success":
      return { bg: "#eaf9f0", border: "#b7e6c3", text: "#16a34a" };
    case "error":
      return { bg: "#fff1f2", border: "#ffb3c0", text: "#e11d48" };
    case "info":
    default:
      return { bg: "#eaf4ff", border: "#bcdcff", text: "#1677ff" };
  }
}

export function MessageProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<MessageItem[]>([]);

  const push = useCallback((type: MessageType, content: string, durationMs = 3000) => {
    const item: MessageItem = { id: newId(), type, content };
    setItems((prev) => [...prev, item]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    }, durationMs);
  }, []);

  const api = useMemo<MessageApi>(
    () => ({
      success: (content, durationMs) => push("success", content, durationMs),
      error: (content, durationMs) => push("error", content, durationMs),
      info: (content, durationMs) => push("info", content, durationMs),
    }),
    [push],
  );

  return (
    <MessageContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed left-1/2 top-3 z-1000 flex w-[min(90vw,520px)] -translate-x-1/2 flex-col gap-2"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((it) => {
          const c = getColor(it.type);
          return (
            <div
              key={it.id}
              className="pointer-events-auto rounded-lg border px-3 py-2 text-xs font-medium shadow-sm"
              style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}
            >
              {it.content}
            </div>
          );
        })}
      </div>
    </MessageContext.Provider>
  );
}

export function useMessage(): MessageApi {
  const ctx = useContext(MessageContext);
  if (!ctx) throw new Error("useMessage must be used within MessageProvider");
  return ctx;
}

