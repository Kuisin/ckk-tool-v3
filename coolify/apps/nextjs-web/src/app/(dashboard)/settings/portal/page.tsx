/**
 * SY0H 取引先ポータル — アカウント一覧。
 *
 * SY01（ユーザー管理）とは別アプリ。あちらの主体は社員（app.users）で、
 * ここは社外の人（app.portal_accounts）。混ぜると一覧が主体混在の表になる。
 *
 * メールアドレスは既定でマスクして出す（社外の個人データ）。
 */

import { Stack } from "@mantine/core";
import { notFound } from "next/navigation";
import { PortalAccountsTable } from "@/components/settings/portal/PortalAccountsTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAppRead } from "@/lib/authz-page";
import { isDevFeatureEnabled } from "@/lib/dev-features";
import { listPortalAccounts, listPortalBpOptions } from "@/lib/portal-admin";
import { peekElevations } from "@/lib/privileged-access";

export const dynamic = "force-dynamic";

export default async function PortalAdminPage() {
  const denied = await requireAppRead("portal-admin");
  if (denied) return denied;
  // 機能そのものが無効な環境では画面ごと出さない（AppAvailabilityGuard は
  // クライアント表示の速路なので、サーバー側でも見る）。
  if (!isDevFeatureEnabled("portal")) notFound();

  const [accounts, bpOptions, elevations] = await Promise.all([
    listPortalAccounts(),
    listPortalBpOptions(),
    // **peek** — 画面を開いただけで持ち時間を動かさない（ボタンの活性を描くだけ）。
    peekElevations([
      "portal_admin.activate_account",
      "portal_admin.issue_backup_codes",
    ]),
  ]);

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={["システム", "取引先ポータル"]}
        title="取引先ポータル"
      />
      <PortalAccountsTable
        accounts={accounts}
        bpOptions={bpOptions}
        canActivate={elevations["portal_admin.activate_account"]?.allowed}
        canIssueBackup={elevations["portal_admin.issue_backup_codes"]?.allowed}
      />
    </Stack>
  );
}
