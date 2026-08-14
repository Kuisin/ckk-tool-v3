import { DeliveryNoteTable } from "@/components/shipping/delivery-notes/DeliveryNoteTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchDeliveryNotes } from "./data";

export const dynamic = "force-dynamic";

/** 納品書 一覧 (SH02). */
export default async function ShippingDeliveryNotesPage() {
  const denied = await requireAppRead("delivery-notes");
  if (denied) return denied;
  const rows = await fetchDeliveryNotes();
  return <DeliveryNoteTable rows={rows} />;
}
