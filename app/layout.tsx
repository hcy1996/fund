import type { Metadata } from "next";
import "./globals.css";
import { AppHeader } from "@/components/layout/app-header";
import { AuthSessionProvider } from "@/components/session-provider";

export const metadata: Metadata = {
  title: "Fund Estimator",
  description: "基金估值与持仓管理工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[#f5f8ff] text-[#1f2a44] antialiased">
        <AuthSessionProvider>
          <AppHeader />
          <div className="mx-auto max-w-5xl px-3 py-3">{children}</div>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
