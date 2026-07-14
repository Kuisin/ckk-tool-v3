import { DeliveryNoteTable } from "@/components/shipping/delivery-notes/DeliveryNoteTable";
import { fetchDeliveryNotes } from "./data";

export const dynamic = "force-dynamic";

/** 納品書 一覧 (SH02). */
export default async function ShippingDeliveryNotesPage() {
  const rows = await fetchDeliveryNotes();
  return <DeliveryNoteTable rows={rows} />;
}
