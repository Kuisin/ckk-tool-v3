import { redirect } from "next/navigation";

/**
 * 旧 操作履歴（SY07）。/settings/activity へ移動したため、旧ブックマーク互換の
 * ためリダイレクトする。
 */
export default function AdminActivityRedirect() {
  redirect("/settings/activity");
}
