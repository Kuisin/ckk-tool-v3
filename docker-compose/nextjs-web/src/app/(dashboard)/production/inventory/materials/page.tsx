import { redirect } from "next/navigation";
import { requireAppRead } from "@/lib/authz-page";

/** 旧 素材在庫 (PD05) 一覧 — 在庫管理（統合）へリダイレクト。 */
export default async function ProductionInventoryMaterialsPage() {
  const denied = await requireAppRead("inventory");
  if (denied) return denied;
  redirect("/production/inventory?tab=materials");
}
