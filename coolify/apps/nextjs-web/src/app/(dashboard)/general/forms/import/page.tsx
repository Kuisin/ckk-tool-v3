import { getTranslations } from "next-intl/server";
import { FormImport } from "@/components/forms/FormImport";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/** 書き出したフォーム定義の取り込み（dev ⇄ 本番の移送）。 */
export default async function ImportFormPage() {
  const tr = await getTranslations();
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  // 取り込みは新しいフォームを作る操作なので、作成権限と同じ扱い。
  const authz = await checkPermission("form", "CREATE");
  if (!authz.ok) {
    return (
      <AccessDenied
        breadcrumbs={[
          tr("common.general"),
          { label: tr("common.forms"), href: "/general/forms" },
        ]}
        message={authz.error}
        title={tr("general.forms.importAForm")}
      />
    );
  }

  return <FormImport />;
}
