import { NewFormClient } from "@/components/forms/NewFormClient";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

export default async function NewFormPage() {
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  // アプリ自体は全員開けるが、作れるのは form:CREATE を持つ人だけ。
  const authz = await checkPermission("form", "CREATE");
  if (!authz.ok) {
    return (
      <AccessDenied
        breadcrumbs={["一般", "フォーム"]}
        message={authz.error}
        title="フォームの作成"
      />
    );
  }

  return <NewFormClient />;
}
