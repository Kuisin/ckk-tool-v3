import { redirect } from "next/navigation";

/** 旧 素材在庫 (PD05) 一覧 — 在庫管理（統合）へリダイレクト。 */
export default function ProductionInventoryMaterialsPage() {
  redirect("/production/inventory?tab=materials");
}
