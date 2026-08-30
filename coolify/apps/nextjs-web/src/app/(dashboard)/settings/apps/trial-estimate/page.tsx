import { redirect } from "next/navigation";
import { requireAppRead } from "@/lib/authz-page";

/**
 * 旧 アプリ設定 → 価格試算 の設定画面。価格試算計算（SY02, /settings/trial-pricing-engine）
 * へ移動したため、旧ブックマーク互換のためリダイレクトする。
 */
export default async function TrialEstimateSettingsRedirect() {
  const denied = await requireAppRead("app-management");
  if (denied) return denied;
  redirect("/settings/trial-pricing-engine");
}
