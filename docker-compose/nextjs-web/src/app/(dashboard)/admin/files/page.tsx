import { redirect } from "next/navigation";

/**
 * 旧 ファイル管理（SY06）。/settings/files へ移動したため、旧ブックマーク互換の
 * ためリダイレクトする。
 */
export default function AdminFilesRedirect() {
  redirect("/settings/files");
}
