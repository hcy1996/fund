"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "注册失败");
      }
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-[#dbe5ff] bg-white p-8 shadow-sm">
      <h1 className="text-xl font-semibold text-[#1f2a44]">注册</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="text-[#6a7ea8]">邮箱</span>
          <input
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-[#dbe5ff] bg-[#f8fbff] px-3 py-2 text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[#6a7ea8]">密码（至少 6 位）</span>
          <input
            type="password"
            required
            minLength={6}
            className="mt-1 w-full rounded-lg border border-[#dbe5ff] bg-[#f8fbff] px-3 py-2 text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#1677ff]/30"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-[#1677ff] py-2.5 text-sm font-medium text-white hover:bg-[#0e66e8] disabled:opacity-50"
        >
          {loading ? "提交中…" : "注册"}
        </button>
      </form>
    </div>
  );
}
