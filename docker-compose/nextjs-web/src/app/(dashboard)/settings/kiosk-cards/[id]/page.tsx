import { IconLock } from "@tabler/icons-react";
import { notFound } from "next/navigation";
import { KioskCardDetailView } from "@/components/settings/kiosk/KioskCardDetailView";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { checkPermission } from "@/lib/authz";
import { normalizeCode } from "@/lib/crockford";
import {
  getKioskCard,
  listCardRecentSessions,
  listKioskAssignableUsers,
} from "@/lib/kiosk-admin";

export const dynamic = "force-dynamic";

/**
 * QRカード詳細（SY08）— カード情報 + 有効期間（テンポラリカード）+ 操作 +
 * 最近のログイン。kiosk 権限（READ）。
 */
export default async function KioskCardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) {
    return (
      <>
        <PageHeader
          breadcrumbs={["システム", "QRカード管理", "カード詳細"]}
          title="カード詳細"
        />
        <EmptyState icon={<IconLock size={28} />} message={authz.error} />
      </>
    );
  }
  const card = await getKioskCard(normalizeCode(id));
  if (!card) notFound();
  const [sessions, userOptions] = await Promise.all([
    listCardRecentSessions(card.id),
    card.status === "UNASSIGNED"
      ? listKioskAssignableUsers()
      : Promise.resolve([]),
  ]);
  return (
    <KioskCardDetailView
      card={card}
      sessions={sessions}
      userOptions={userOptions}
    />
  );
}
