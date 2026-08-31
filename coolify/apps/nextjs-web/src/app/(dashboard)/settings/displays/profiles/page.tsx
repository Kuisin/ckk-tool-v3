import { DisplayProfilesPanel } from "@/components/settings/displays/DisplayProfilesPanel";
import { requireAppRead } from "@/lib/authz-page";
import { listDisplayProfiles, listPlantOptions } from "@/lib/displays-admin";

export const dynamic = "force-dynamic";

/** ディスプレイ管理 — 表示内容（プロファイル）の一覧と編集。 */
export default async function DisplayProfilesPage() {
  const denied = await requireAppRead("displays");
  if (denied) return denied;

  const [profiles, plantOptions] = await Promise.all([
    listDisplayProfiles(),
    listPlantOptions(),
  ]);

  return <DisplayProfilesPanel plantOptions={plantOptions} rows={profiles} />;
}
