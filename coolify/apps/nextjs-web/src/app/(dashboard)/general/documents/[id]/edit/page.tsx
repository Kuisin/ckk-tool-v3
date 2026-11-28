import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DocumentEditor } from "@/components/documents/DocumentEditor";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { requireAppRead } from "@/lib/authz-page";
import { fetchPage, pageAccess } from "@/lib/internal-pages";

export const dynamic = "force-dynamic";

export default async function EditDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tr = await getTranslations();
  const denied = await requireAppRead("internal-pages");
  if (denied) return denied;

  const { id } = await params;
  const page = await fetchPage(id);
  if (!page) notFound();

  const access = await pageAccess(page);
  // アーカイブ中は編集させない（保存で黙ってアーカイブが外れるため）。
  if (!access.canEdit || page.status === "ARCHIVED") {
    return (
      <AccessDenied
        breadcrumbs={[
          tr("common.general"),
          { label: tr("common.internalDocuments"), href: "/general/documents" },
        ]}
        message={
          access.canEdit
            ? tr("general.documentActions.editBlockedWhileArchived")
            : tr("general.documents.youDoNotHavePermissionTo")
        }
        title={page.title}
      />
    );
  }

  return (
    <DocumentEditor
      initial={{
        title: page.draftTitle,
        summary: page.summary ?? "",
        folder: page.folder ?? "",
        approvalRequired: page.approvalRequired,
        body: page.draftBody,
      }}
      mode="edit"
      pageNumber={page.pageNumber}
    />
  );
}
