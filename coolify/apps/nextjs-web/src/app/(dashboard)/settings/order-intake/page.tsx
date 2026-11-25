import { Stack } from "@mantine/core";
import { getLocale, getTranslations } from "next-intl/server";
import { IntakeCompanyPanel } from "@/components/settings/order-intake/IntakeCompanyPanel";
import { OrderIntakeFolderPanel } from "@/components/settings/order-intake/OrderIntakeFolderPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { localized } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { getIntakeFolderCompanyId } from "@/lib/intake-company";
import { readIntakeFolder } from "@/lib/intake-folder";
import { loadOwnCompanies } from "@/lib/own-companies";
import { fetchIntakeDocs } from "./data";

export const dynamic = "force-dynamic";

/**
 * 注文書取込（SY0C）— 取込フォルダ（INTAKE_DIR）の状態と、複数ファイルの投入。
 * system 権限。
 *
 * 受け取った注文書（PDF・スキャン画像）は監視フォルダ経由で注文請書へ取り込まれ
 * るが、これまでフォルダを触るにはサーバーへ SSH するしかなかった。この画面は
 * その 1 点を埋める — まとめて投入し、取込待ち / 失敗 / 取込済 を見る。
 * 各ファイルは**なった注文請書（SA04）へリンク**する（番号はファイル名に
 * 焼き込まれている — lib/intake.ts）ので、結果を追うのに番号を探し回らない。
 */
export default async function OrderIntakeSettingsPage() {
  const tr = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const denied = await requireAppRead("order-intake");
  if (denied) return denied;

  const status = await readIntakeFolder(locale);
  const docs = await fetchIntakeDocs(status);
  // 取込口の自社法人 — 取込で作る注文請書の発行元（lib/intake-company.ts）。
  const [intakeCompanyId, companies, canEdit] = await Promise.all([
    getIntakeFolderCompanyId(),
    loadOwnCompanies(),
    checkPermission("system", "UPDATE").then((r) => r.ok),
  ]);
  const companyOptions = companies.map((c) => {
    const name = c.name ? localized(c.name, locale) : "";
    return {
      value: String(c.id),
      label: name && name !== "—" ? `${c.code} ${name}` : c.code,
    };
  });

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[tr("common.system"), tr("common.orderIntake")]}
        title={tr("common.orderIntake")}
      />
      <IntakeCompanyPanel
        canEdit={canEdit}
        companyId={intakeCompanyId}
        options={companyOptions}
      />
      <OrderIntakeFolderPanel docs={docs} status={status} />
    </Stack>
  );
}
