import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-[#dbe5ff] bg-white p-8 shadow-sm">
      <h1 className="text-xl font-semibold text-[#1f2a44]">登录</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-[#8ea1c8]">加载中…</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
