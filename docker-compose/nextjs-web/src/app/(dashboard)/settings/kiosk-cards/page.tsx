import { IconLock } from "@tabler/icons-react";
import { KioskCardsTable } from "@/components/settings/kiosk/KioskCardsTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { checkPermission } from "@/lib/authz";
import { listKioskAssignableUsers, listKioskCards } from "@/lib/kiosk-admin";

export const dynamic = "force-dynamic";

/** QRカード管理（SY08）— キオスクログイン用カードの一覧。kiosk 権限（READ）。 */
export default async function KioskCardsPage() {
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) {
    return (
      <>
        <PageHeader
          breadcrumbs={["システム", "QRカード管理"]}
          title="QRカード管理"
        />
        <EmptyState icon={<IconLock size={28} />} message={authz.error} />
      </>
    );
  }
  const [cards, userOptions] = await Promise.all([
    listKioskCards(),
    listKioskAssignableUsers(),
  ]);
  return <KioskCardsTable rows={cards} userOptions={userOptions} />;
}
