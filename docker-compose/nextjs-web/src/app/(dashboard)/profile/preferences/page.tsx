import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DisplayPreferencesForm } from "@/components/profile/DisplayPreferencesForm";
import { getCurrentPreferences } from "@/lib/user-preferences";

export const dynamic = "force-dynamic";

/** 表示設定 — 言語・日付形式・時刻形式・タイムゾーン（本人のみ）。 */
export default async function DisplayPreferencesPage() {
  const session = await auth();
  if (!(session?.user as { id?: string } | undefined)?.id) redirect("/login");

  const prefs = await getCurrentPreferences();
  return <DisplayPreferencesForm initial={prefs} />;
}
