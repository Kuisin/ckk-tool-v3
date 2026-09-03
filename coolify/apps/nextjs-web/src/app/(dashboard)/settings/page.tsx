import { redirect } from "next/navigation";
import { workprocessHomeHref } from "@/lib/app-list";

/**
 * 旧 システム設定ハブ（SY01）。他カテゴリ同様にハブアプリは持たない構成へ
 * 統一したため、ホームのシステムカテゴリ表示へリダイレクトする。
 */
export default function SettingsIndexRedirect() {
  redirect(workprocessHomeHref("システム")); // i18n-ignore — AppCategory の内部識別子（表示は categoryLabel が担う）
}
