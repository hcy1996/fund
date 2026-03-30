import { redirect } from "next/navigation";

export default function SearchPage({
  searchParams,
}: {
  searchParams?: { code?: string; accountId?: string };
}) {
  const code = searchParams?.code?.trim() ?? "";
  if (!/^\d{6}$/.test(code)) redirect("/");

  const qs = new URLSearchParams();
  const accountId = searchParams?.accountId?.trim();
  if (accountId) qs.set("accountId", accountId);

  redirect(`/funds/${encodeURIComponent(code)}${qs.toString() ? `?${qs.toString()}` : ""}`);
}
