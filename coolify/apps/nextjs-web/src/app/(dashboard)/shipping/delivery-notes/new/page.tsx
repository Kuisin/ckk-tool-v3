import { DeliveryNoteForm } from "@/components/shipping/delivery-notes/DeliveryNoteForm";
import { requireAppRead } from "@/lib/authz-page";
import { fetchDeliveryOrderCandidates } from "../data";

export const dynamic = "force-dynamic";

/**
 * 納品書 新規作成 (SH12).
 *
 * `?deliveryOrder=DOR-…` で出荷書をプリセレクトできる（出荷書詳細からの
 * 起動用）。候補は確定済み・出荷済みの出荷書のみ（サーバーロード）。
 */
export default async function ShippingDeliveryNotesNewPage({
  searchParams,
}: {
  searchParams: Promise<{ deliveryOrder?: string }>;
}) {
  const denied = await requireAppRead("delivery-notes");
  if (denied) return denied;
  const [sp, candidates] = await Promise.all([
    searchParams,
    fetchDeliveryOrderCandidates(),
  ]);
  return (
    <DeliveryNoteForm
      candidates={candidates}
      initialDeliveryOrder={sp.deliveryOrder ?? null}
      mode="create"
    />
  );
}
