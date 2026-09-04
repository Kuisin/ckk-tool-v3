/**
 * SY0H 取引先ポータル — アカウント 1 件。
 *
 * 一覧は「誰が居るか」までしか言えない。**その人に実際に何が見えているのか**
 * （共有範囲）、**何を見たのか**（閲覧記録）、**どのリンクを渡してあるのか**
 * はここで読む。社外へ書類を出す機能の点検口なので、この 3 つが同じ画面に
 * 揃っていないと「見えているはず／見えていないはず」を確かめられない。
 *
 * ■ 閲覧記録の IP を伏せない
 * 個人データだが、この表（portal_access_logs）は「誰が何を見たか」に答える
 * ために在る。入口の `portal_admin` は業務ロールへ配っていない特権コードで、
 * ここを伏せると点検は psql に落ちる。SY0D（ログイン履歴）が詳細を昇格で
 * 閉じているのは**社員本人**の端末情報だからで、対象が違う。
 *
 * ■ ここで足す操作は「アクセスを減らす」ものだけ
 * 共有範囲の失効・リンクの失効はどちらも承認不要（lib/privileged-operations.ts
 * の判断と同じ — 減らす操作を承認待ちにしない）。有効化とバックアップコードの
 * 発行は一覧の側にあり、SY0G の承認が要る。
 */

import { Stack } from "@mantine/core";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PortalAccountDetailView } from "@/components/settings/portal/PortalAccountDetailView";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAppRead } from "@/lib/authz-page";
import { isDevFeatureEnabled } from "@/lib/dev-features";
import { getPortalAccount } from "@/lib/portal-admin";
import { listPortalLinks } from "@/lib/portal-links";

export const dynamic = "force-dynamic";

export default async function PortalAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tr = await getTranslations();
  const denied = await requireAppRead("portal-admin");
  if (denied) return denied;
  if (!isDevFeatureEnabled("portal")) notFound();

  const { id } = await params;
  const account = await getPortalAccount(id);
  if (!account) notFound();

  const links = await listPortalLinks({ portalAccountId: id });

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          tr("common.system"),
          tr("common.partnerPortal"),
          account.displayName,
        ]}
        title={account.displayName}
      />
      <PortalAccountDetailView
        account={account}
        links={links.map((l) => ({
          ...l,
          expiresAt: l.expiresAt.toISOString(),
          revokedAt: l.revokedAt?.toISOString() ?? null,
          lastUsedAt: l.lastUsedAt?.toISOString() ?? null,
          createdAt: l.createdAt.toISOString(),
        }))}
      />
    </Stack>
  );
}
