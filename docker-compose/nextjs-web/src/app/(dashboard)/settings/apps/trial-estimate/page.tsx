import { redirect } from "next/navigation";

/**
 * 旧 アプリ設定 → 試算 の設定画面。試算計算（SY02, /settings/trial-pricing-engine）
 * へ移動したため、旧ブックマーク互換のためリダイレクトする。
 */
export default function TrialEstimateSettingsRedirect() {
  redirect("/settings/trial-pricing-engine");
}
