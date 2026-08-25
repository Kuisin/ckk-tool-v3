import { notFound } from "next/navigation";
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
  const denied = await requireAppRead("internal-pages");
  if (denied) return denied;

  const { id } = await params;
  const page = await fetchPage(id);
  if (!page) notFound();

  const access = await pageAccess(page);
  if (!access.canEdit) {
    return (
      <AccessDenied
        breadcrumbs={[
          "一般",
          { label: "社内文書", href: "/general/documents" },
        ]}
        message="この文書を編集する権限がありません。"
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
