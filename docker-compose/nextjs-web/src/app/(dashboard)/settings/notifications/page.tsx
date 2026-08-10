import { redirect } from "next/navigation";

/**
 * 旧 設定 → 通知設定。個人設定はプロフィール配下（/profile/notifications）へ
 * 移動したため、旧ブックマーク互換のためリダイレクトする。
 */
export default function NotificationSettingsRedirect() {
  redirect("/profile/notifications");
}
