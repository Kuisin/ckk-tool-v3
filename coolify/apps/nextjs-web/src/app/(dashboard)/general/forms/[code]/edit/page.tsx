import { notFound } from "next/navigation";
import { EditFormClient } from "@/components/forms/EditFormClient";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { requireAppRead } from "@/lib/authz-page";
import { fetchForm, formAccess } from "@/lib/forms";

export const dynamic = "force-dynamic";

export default async function EditFormPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  const { code } = await params;
  const form = await fetchForm(code);
  if (!form) notFound();

  const access = await formAccess(form);
  if (!access.canEdit) {
    return (
      <AccessDenied
        breadcrumbs={["一般", { label: "フォーム", href: "/general/forms" }]}
        message="このフォームを編集する権限がありません。"
        title={form.title}
      />
    );
  }

  return (
    <EditFormClient
      code={code}
      fields={form.fields}
      settings={{
        title: form.title,
        description: form.description ?? "",
        kind: form.kind,
        respondentVisibility: form.respondentVisibility,
        approvalEnabled: form.approvalEnabled,
        editableUntilFirstApproval: form.editableUntilFirstApproval,
        allowMultiple: form.allowMultiple,
        opensAt: form.opensAt?.toISOString() ?? null,
        closesAt: form.closesAt?.toISOString() ?? null,
        responseEditMode: form.responseEditMode,
        responseEditableUntil:
          form.responseEditableUntil?.toISOString() ?? null,
      }}
    />
  );
}
