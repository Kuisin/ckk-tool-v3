import { Stack } from "@mantine/core";
import { IconHistory } from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import { AccountingExportForm } from "@/components/settings/AccountingExportForm";
import { SecondaryButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAccountingSettings } from "@/lib/accounting-settings";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/**
 * 会計連携（SY0J）— 請求書から出す仕訳 CSV の形。system 権限。
 *
 * 会計ソフトの受入レイアウトは環境ごとに違い、経理（税務事務所）の都合で変わる。
 * 以前は列の並びも勘定科目もコードに直書きしてあったので、会計ソフトを替えるだけで
 * 実装の変更とデプロイが要った。ここで持てば設定を直すだけで済む。
 *
 * 行ごとの科目コードはマスタ側にある — 消費税コードと貸方科目は 税区分（MS0F）、
 * 売掛金の科目と補助科目は 取引先（MS01）。この画面が持つのは**形**と、マスタが
 * 空だったときの**既定**。
 */
export default async function AccountingSettingsPage() {
  const tr = await getTranslations();
  const denied = await requireAppRead("accounting");
  if (denied) return denied;

  const initial = await getAccountingSettings();

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <SecondaryButton
            href="/settings/accounting/documents"
            leftSection={<IconHistory size={14} />}
          >
            {tr("billing.accountingDocuments.documentsList")}
          </SecondaryButton>
        }
        breadcrumbs={[
          tr("common.system"),
          tr("settings.accounting.accounting"),
        ]}
        title={tr("settings.accounting.accounting")}
      />
      <AccountingExportForm initial={initial} />
    </Stack>
  );
}
