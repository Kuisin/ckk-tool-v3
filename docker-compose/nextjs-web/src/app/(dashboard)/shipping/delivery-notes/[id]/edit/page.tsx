import { notFound, redirect } from "next/navigation";
import { DeliveryNoteForm } from "@/components/shipping/delivery-notes/DeliveryNoteForm";
import { isEditable } from "@/components/shipping/delivery-notes/model";
import { parseDocKey } from "@/lib/doc-number";
import { fetchDeliveryNote } from "../../data";

export const dynamic = "force-dynamic";

/**
 * 納品書 編集 (SH22 → edit)。
 *
 * 編集できるのは下書きのみ — それ以外は詳細へリダイレクト
 * （サーバーアクション側でも同じガードを行う）。出荷書・納品先は変更不可。
 */
export default async function ShippingDeliveryNotesEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = parseDocKey(decodeURIComponent(id), "DRN");
  if (!key) notFound();

  const note = await fetchDeliveryNote(key);
  if (!note) notFound();
  if (!isEditable(note)) redirect(`/shipping/delivery-notes/${note.id}`);

  return <DeliveryNoteForm candidates={[]} mode="edit" note={note} />;
}
