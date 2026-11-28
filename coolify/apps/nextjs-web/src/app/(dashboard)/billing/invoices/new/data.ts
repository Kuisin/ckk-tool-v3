/**
 * data.ts — 手動請求 (BL11) の対象出荷取得。
 *
 * 締日を待たず、選んだ出荷から臨時の請求書を起こす（§9）。未請求の判定は
 * 締日処理と同じ「invoice_items にその出荷書が現れないこと」（closings/data.ts
 * fetchUninvoicedShipmentsForCustomer）— 締日窓には依存しない、その顧客の
 * 未請求出荷を全件返す。
 *
 * **行は納品書番号で見せるが、請求の単位は出荷書のまま。** 未請求の判定キーが
 * 出荷書なので、ここだけ納品書単位にすると二重請求の穴が開く。
 */

import {
  fetchUninvoicedShipmentsForCustomer,
  shipmentAmount,
} from "@/app/(dashboard)/billing/closings/data";
import { docIdOf, docIdOrNull } from "@/lib/doc-number";

export interface UnbilledShipmentRow {
  /** 出荷書の id（`CKK~DOR-2026-00001`）— 選択の対象キーを兼ねる。 */
  deliveryOrderNumber: string;
  /** 納品書の id（`CKK~DRN-2026-00001`。未発行なら null — 副次表示）。 */
  deliveryNoteNumber: string | null;
  shippedAt: string | null;
  quantity: number;
  amount: number;
}

/** その顧客の未請求出荷（締日窓に依らず全件）。行は出荷日の新しい順。 */
export async function fetchUnbilledShipmentRows(
  customerBpId: string,
): Promise<UnbilledShipmentRow[]> {
  const rows = await fetchUninvoicedShipmentsForCustomer(customerBpId);
  return rows
    .map((s) => {
      const note = s.deliveryNotes[0] ?? null;
      return {
        deliveryOrderNumber: docIdOf(s),
        deliveryNoteNumber: docIdOrNull(note),
        shippedAt: s.shippedAt?.toISOString() ?? null,
        quantity: s.items.reduce((sum, it) => sum + it.quantity, 0),
        amount: shipmentAmount(s),
      };
    })
    .sort((a, b) => (b.shippedAt ?? "").localeCompare(a.shippedAt ?? ""));
}
