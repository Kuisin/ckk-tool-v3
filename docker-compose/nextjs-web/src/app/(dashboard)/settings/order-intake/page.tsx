import { Stack } from "@mantine/core";
import { OrderIntakeFolderPanel } from "@/components/settings/order-intake/OrderIntakeFolderPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAppRead } from "@/lib/authz-page";
import { readIntakeFolder } from "@/lib/intake-folder";

export const dynamic = "force-dynamic";

/**
 * 注文書取込（SY0C）— 取込フォルダ（INTAKE_DIR）の状態と、複数ファイルの投入。
 * system 権限。
 *
 * 受け取った注文書（PDF・スキャン画像）は監視フォルダ経由で受注請書へ取り込まれ
 * るが、これまでフォルダを触るにはサーバーへ SSH するしかなかった。この画面は
 * その 1 点だけを埋める — まとめて投入し、待ち / 取込済 / 失敗を見る。
 * 取込結果（受注請書そのもの）は SA04 受注請書の一覧で確認する。
 */
export default async function OrderIntakeSettingsPage() {
  const denied = await requireAppRead("order-intake");
  if (denied) return denied;

  const status = await readIntakeFolder();

  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={["システム", "注文書取込"]} title="注文書取込" />
      <OrderIntakeFolderPanel status={status} />
    </Stack>
  );
}
