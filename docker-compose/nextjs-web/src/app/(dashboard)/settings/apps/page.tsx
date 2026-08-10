import { redirect } from "next/navigation";

/**
 * 旧 アプリ設定インデックス。システム設定ハブ（/settings）がアプリ設定一覧
 * そのものになったため、旧ブックマーク互換のためリダイレクトする。
 * （配下の /settings/apps/trial-estimate リダイレクトは存置。）
 */
export default function AppSettingsIndexRedirect() {
  redirect("/settings");
}
