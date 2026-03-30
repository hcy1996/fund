"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email: email.trim(),
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("邮箱或密码错误");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
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
        <span className="text-[#6a7ea8]">密码</span>
        <input
          type="password"
          required
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
        {loading ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
