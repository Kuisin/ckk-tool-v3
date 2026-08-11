import { redirect } from "next/navigation";

/**
 * /admin にはインデックスページがなく 404 になっていたため、
 * 既定のシステム管理アプリ（アプリ管理 SY05）へリダイレクトする。
 */
export default function AdminIndexRedirect() {
  redirect("/admin/apps");
}
