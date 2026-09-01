import { Stack } from "@mantine/core";
import { getTranslations } from "next-intl/server";
import { LinkAdminPanel } from "@/components/settings/links/LinkAdminPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAppRead } from "@/lib/authz-page";
import { listBlacklist, listIndexedLinks } from "@/lib/link-index";

export const dynamic = "force-dynamic";

/**
 * リンク管理（SY0B）— メモ / コメント内の外部リンク索引とブロック指定。system 権限。
 *
 * 索引タブは「どの外部サイトへのリンクが社内文書に貼られているか」の一覧、
 * ブロックタブはその遷移を禁止するホスト名の管理。ブロックは確認ページ
 * （/l/<code>）でクリック時に判定されるので、既存リンクにも遡って効く。
 */
export default async function LinkSettingsPage() {
  const tr = await getTranslations();
  const denied = await requireAppRead("links");
  if (denied) return denied;

  const [blacklist, links] = await Promise.all([
    listBlacklist(),
    listIndexedLinks(),
  ]);

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[tr("common.system"), tr("settings.links.links")]}
        title={tr("settings.links.links")}
      />
      <LinkAdminPanel blacklist={blacklist} links={links} />
    </Stack>
  );
}
