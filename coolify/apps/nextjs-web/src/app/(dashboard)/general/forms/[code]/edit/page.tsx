import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
  const tr = await getTranslations();
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  const { code } = await params;
  const form = await fetchForm(code);
  if (!form) notFound();

  const access = await formAccess(form);
  if (!access.canEdit) {
    return (
      <AccessDenied
        breadcrumbs={[
          tr("common.general"),
          { label: tr("common.forms"), href: "/general/forms" },
        ]}
        message={tr("general.forms.youDoNotHavePermissionTo")}
        title={form.title}
      />
    );
  }

  return (
    <EditFormClient
      code={code}
      fields={form.fields}
      sections={form.sections}
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
