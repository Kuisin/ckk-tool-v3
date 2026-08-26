import { notFound } from "next/navigation";
import { FormDetail } from "@/components/forms/FormDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { sessionUserId } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { fetchForm, formAccess, listResponses } from "@/lib/forms";
import { listShareGrants } from "@/lib/share-grants";
import { saveShareGrants, setFormStatus } from "../actions";
import { fetchRoleOptions } from "../data";

export const dynamic = "force-dynamic";

export default async function FormDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  const { code } = await params;
  const form = await fetchForm(code);
  if (!form) notFound();

  // 権限コードだけでは足りない — このフォームを見てよいかは共有設定が決める。
  const access = await formAccess(form);
  if (!access.canRead) notFound();

  const viewerId = await sessionUserId();
  const [responses, grants, roleOptions, auditEntries] = await Promise.all([
    listResponses(form, access.responseScope, viewerId),
    listShareGrants("forms", code),
    fetchRoleOptions(),
    fetchAuditEntries("forms", code),
  ]);

  return (
    <FormDetail
      auditEntries={auditEntries}
      canEdit={access.canEdit}
      canManage={access.canManage}
      form={form}
      grants={grants}
      onSaveShare={async (next) => {
        "use server";
        const result = await saveShareGrants(
          code,
          next as Parameters<typeof saveShareGrants>[1],
        );
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }}
      onSetStatus={async (status) => {
        "use server";
        const result = await setFormStatus(code, status);
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }}
      responses={responses}
      roleOptions={roleOptions}
    />
  );
}
