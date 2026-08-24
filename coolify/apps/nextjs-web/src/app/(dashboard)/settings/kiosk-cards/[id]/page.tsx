import { notFound } from "next/navigation";
import { KioskCardDetailView } from "@/components/settings/kiosk/KioskCardDetailView";
import { requireAppRead } from "@/lib/authz-page";
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
  const denied = await requireAppRead("kiosk-cards");
  if (denied) return denied;
  const { id } = await params;
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
