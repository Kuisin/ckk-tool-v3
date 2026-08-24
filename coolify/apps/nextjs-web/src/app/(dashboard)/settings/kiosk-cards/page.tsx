import { KioskCardsTable } from "@/components/settings/kiosk/KioskCardsTable";
import { requireAppRead } from "@/lib/authz-page";
import { listKioskAssignableUsers, listKioskCards } from "@/lib/kiosk-admin";

export const dynamic = "force-dynamic";

/** QRカード管理（SY08）— キオスクログイン用カードの一覧。kiosk 権限（READ）。 */
export default async function KioskCardsPage() {
  const denied = await requireAppRead("kiosk-cards");
  if (denied) return denied;
  const [cards, userOptions] = await Promise.all([
    listKioskCards(),
    listKioskAssignableUsers(),
  ]);
  return <KioskCardsTable rows={cards} userOptions={userOptions} />;
}
