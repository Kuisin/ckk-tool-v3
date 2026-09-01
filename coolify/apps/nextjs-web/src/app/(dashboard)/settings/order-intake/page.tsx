import { Stack } from "@mantine/core";
import { OrderIntakeFolderPanel } from "@/components/settings/order-intake/OrderIntakeFolderPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAppRead } from "@/lib/authz-page";
import { readIntakeFolder } from "@/lib/intake-folder";
import { getTr } from "@/lib/ui-text-server";
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
  const tr = await getTr();
  const denied = await requireAppRead("order-intake");
  if (denied) return denied;

  const status = await readIntakeFolder();
  const docs = await fetchIntakeDocs(status);

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[tr("システム"), tr("注文書取込")]}
        title={tr("注文書取込")}
      />
      <OrderIntakeFolderPanel docs={docs} status={status} />
    </Stack>
  );
}
