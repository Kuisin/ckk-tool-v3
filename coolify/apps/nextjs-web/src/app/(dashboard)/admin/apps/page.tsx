import { redirect } from "next/navigation";

/**
 * 旧 アプリ管理（SY05）。/settings/apps へ移動したため、旧ブックマーク互換の
 * ためリダイレクトする。
 */
export default function AdminAppsRedirect() {
  redirect("/settings/apps");
}
