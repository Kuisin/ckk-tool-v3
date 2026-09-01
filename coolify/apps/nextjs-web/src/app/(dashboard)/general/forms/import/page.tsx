import { FormImport } from "@/components/forms/FormImport";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { getTr } from "@/lib/ui-text-server";

export const dynamic = "force-dynamic";

/** 書き出したフォーム定義の取り込み（dev ⇄ 本番の移送）。 */
export default async function ImportFormPage() {
  const tr = await getTr();
  const denied = await requireAppRead("forms");
  if (denied) return denied;

  // 取り込みは新しいフォームを作る操作なので、作成権限と同じ扱い。
  const authz = await checkPermission("form", "CREATE");
  if (!authz.ok) {
    return (
      <AccessDenied
        breadcrumbs={[
          tr("一般"),
          { label: tr("フォーム"), href: "/general/forms" },
        ]}
        message={authz.error}
        title={tr("フォームの取り込み")}
      />
    );
  }

  return <FormImport />;
}
