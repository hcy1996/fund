import { redirect } from "next/navigation";

export default function AdminHomePage() {
  // 默认进入目录第一项
  redirect("/admin/fund-categories");
}

