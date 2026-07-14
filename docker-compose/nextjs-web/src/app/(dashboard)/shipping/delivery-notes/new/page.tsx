import { DeliveryNoteForm } from "@/components/shipping/delivery-notes/DeliveryNoteForm";
import { fetchShippingOrderCandidates } from "../data";

export const dynamic = "force-dynamic";

/**
 * 納品書 新規作成 (SH12).
 *
 * `?shippingOrder=SHP-…` で出荷書をプリセレクトできる（出荷書詳細からの
 * 起動用）。候補は確定済み・出荷済みの出荷書のみ（サーバーロード）。
 */
export default async function ShippingDeliveryNotesNewPage({
  searchParams,
}: {
  searchParams: Promise<{ shippingOrder?: string }>;
}) {
  const [sp, candidates] = await Promise.all([
    searchParams,
    fetchShippingOrderCandidates(),
  ]);
  return (
    <DeliveryNoteForm
      candidates={candidates}
      initialShippingOrder={sp.shippingOrder ?? null}
      mode="create"
    />
  );
}
