import { FormsTable } from "@/components/forms/FormsTable";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { listForms } from "@/lib/forms";

export const dynamic = "force-dynamic";

/** フォーム一覧 (CM02) — 自分が作った / 自分に共有されたフォームだけを出す。 */
export default async function FormsPage() {
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  const [rows, canCreate] = await Promise.all([
    listForms(),
    checkPermission("form", "CREATE"),
  ]);

  return <FormsTable canCreate={canCreate.ok} rows={rows} />;
}
