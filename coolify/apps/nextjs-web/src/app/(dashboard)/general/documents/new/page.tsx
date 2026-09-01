import { DocumentEditor } from "@/components/documents/DocumentEditor";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { getTr } from "@/lib/ui-text-server";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage() {
  const tr = await getTr();
  const denied = await requireAppRead("internal-pages");
  if (denied) return denied;

  // アプリは読めても、作れるのは internal_page:CREATE を持つ人だけ。
  const authz = await checkPermission("internal_page", "CREATE");
  if (!authz.ok) {
    return (
      <AccessDenied
        breadcrumbs={[
          tr("一般"),
          { label: tr("社内文書"), href: "/general/documents" },
        ]}
        message={authz.error}
        title={tr("文書の作成")}
      />
    );
  }

  return (
    <DocumentEditor
      initial={{
        title: "",
        summary: "",
        folder: "",
        approvalRequired: false,
        body: "",
      }}
      mode="new"
    />
  );
}
