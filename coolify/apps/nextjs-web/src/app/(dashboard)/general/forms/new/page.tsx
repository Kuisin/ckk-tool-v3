import { getTranslations } from "next-intl/server";
import { NewFormClient } from "@/components/forms/NewFormClient";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

export default async function NewFormPage() {
  const tr = await getTranslations();
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  // アプリ自体は全員開けるが、作れるのは form:CREATE を持つ人だけ。
  const authz = await checkPermission("form", "CREATE");
  if (!authz.ok) {
    return (
      <AccessDenied
        breadcrumbs={[tr("common.general"), tr("common.forms")]}
        message={authz.error}
        title={tr("general.forms.createAForm")}
      />
    );
  }

  return <NewFormClient />;
}
