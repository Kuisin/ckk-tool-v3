import { DocumentsTable } from "@/components/documents/DocumentsTable";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { listPages } from "@/lib/internal-pages";

export const dynamic = "force-dynamic";

/** 社内文書 一覧 (CM03) — 自分が作った / 共有された文書だけを出す。 */
export default async function DocumentsPage() {
  const denied = await requireAppRead("internal-pages");
  if (denied) return denied;

  const [rows, canCreate] = await Promise.all([
    listPages(),
    checkPermission("internal_page", "CREATE"),
  ]);

  return <DocumentsTable canCreate={canCreate.ok} rows={rows} />;
}
