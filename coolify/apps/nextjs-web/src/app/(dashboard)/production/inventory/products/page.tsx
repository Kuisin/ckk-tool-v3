import { redirect } from "next/navigation";
import { requireAppRead } from "@/lib/authz-page";

/** 旧 製品在庫 (PD04) 一覧 — 在庫管理（統合）へリダイレクト。 */
export default async function ProductionInventoryProductsPage() {
  const denied = await requireAppRead("inventory");
  if (denied) return denied;
  redirect("/production/inventory?tab=products");
}
