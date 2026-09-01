import { getTranslations } from "next-intl/server";
import { DocumentEditor } from "@/components/documents/DocumentEditor";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage() {
  const tr = await getTranslations();
  const denied = await requireAppRead("internal-pages");
  if (denied) return denied;

  // アプリは読めても、作れるのは internal_page:CREATE を持つ人だけ。
  const authz = await checkPermission("internal_page", "CREATE");
  if (!authz.ok) {
    return (
      <AccessDenied
        breadcrumbs={[
          tr("common.general"),
          { label: tr("common.internalDocuments"), href: "/general/documents" },
        ]}
        message={authz.error}
        title={tr("general.documents.createADocument")}
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
