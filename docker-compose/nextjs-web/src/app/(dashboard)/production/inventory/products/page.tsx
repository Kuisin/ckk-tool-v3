import { redirect } from "next/navigation";

/** 旧 製品在庫 (PD04) 一覧 — 在庫管理（統合）へリダイレクト。 */
export default function ProductionInventoryProductsPage() {
  redirect("/production/inventory?tab=products");
}
