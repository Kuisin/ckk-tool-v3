import { notFound } from "next/navigation";
import { DisplayDetailView } from "@/components/settings/displays/DisplayDetailView";
import { PrivilegedAccessBanner } from "@/components/settings/privileged/PrivilegedAccessBanner";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import {
  getDisplayDetail,
  listPairableProfiles,
  listPlantOptions,
} from "@/lib/displays-admin";

export const dynamic = "force-dynamic";

/** ディスプレイ詳細 — 状態・素性・表示内容の割当・停止/失効。 */
export default async function DisplayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("kiosk-devices");
  if (denied) return denied;

  const { id } = await params;
  const display = await getDisplayDetail(id);
  if (!display) notFound();

  const [profiles, plantOptions, audit] = await Promise.all([
    listPairableProfiles(),
    listPlantOptions(),
    fetchAuditEntries("display_devices", id),
  ]);

  return (
    <>
      <PrivilegedAccessBanner code="kiosk_device" />
      <DisplayDetailView
        audit={audit}
        display={display}
        plantOptions={plantOptions}
        profiles={profiles}
      />
    </>
  );
}
