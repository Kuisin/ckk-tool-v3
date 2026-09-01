import { NewFormClient } from "@/components/forms/NewFormClient";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { getTr } from "@/lib/ui-text-server";

export const dynamic = "force-dynamic";

export default async function NewFormPage() {
  const tr = await getTr();
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  // アプリ自体は全員開けるが、作れるのは form:CREATE を持つ人だけ。
  const authz = await checkPermission("form", "CREATE");
  if (!authz.ok) {
    return (
      <AccessDenied
        breadcrumbs={[tr("一般"), tr("フォーム")]}
        message={authz.error}
        title={tr("フォームの作成")}
      />
    );
  }

  return <NewFormClient />;
}
