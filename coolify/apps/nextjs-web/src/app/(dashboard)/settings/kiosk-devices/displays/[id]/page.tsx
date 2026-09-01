import { notFound } from "next/navigation";
import { DisplayDetailView } from "@/components/settings/displays/DisplayDetailView";
import { PrivilegedAccessBanner } from "@/components/settings/privileged/PrivilegedAccessBanner";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import {
  getDisplayDetail,
  listMachineScreens,
  listPlantOptions,
} from "@/lib/displays-admin";

export const dynamic = "force-dynamic";

/** ディスプレイ詳細 — 状態・素性・**何を映すか**・停止/失効。 */
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

  const [plantOptions, audit, machineScreens] = await Promise.all([
    listPlantOptions(),
    fetchAuditEntries("display_devices", id),
    // 1 台で 2 枚出している機械なら、もう一方へ行ける選択を出す
    listMachineScreens(display.machineId),
  ]);

  return (
    <>
      <PrivilegedAccessBanner code="kiosk_device" />
      <DisplayDetailView
        audit={audit}
        display={display}
        machineScreens={machineScreens}
        plantOptions={plantOptions}
      />
    </>
  );
}
