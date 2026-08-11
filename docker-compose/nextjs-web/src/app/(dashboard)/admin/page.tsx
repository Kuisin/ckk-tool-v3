import { redirect } from "next/navigation";

/**
 * 旧 /admin 配下。システム系アプリは他カテゴリ同様 /settings 配下へ統一した
 * ため、旧ブックマーク互換のためリダイレクトする。
 */
export default function AdminIndexRedirect() {
  redirect("/settings");
}
