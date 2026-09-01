import { Stack } from "@mantine/core";
import { AiProviderForm } from "@/components/settings/AiProviderForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAiProviderSettings } from "@/lib/ai-provider";
import { requireAppRead } from "@/lib/authz-page";
import { getTr } from "@/lib/ui-text-server";

export const dynamic = "force-dynamic";

/**
 * AI プロバイダ（SY0E）— 文書抽出と AI 補助タスクが使うモデルの接続先。
 * system 権限。
 *
 * これまで接続先とモデルは po-extract の環境変数でしか変えられず、変更に
 * Coolify での編集と再デプロイが要った。GPU は 1 台を dev/main で共有している
 * ので、混雑時に外へ逃がす手段も、精度を比べる手段も無かった。この画面はその
 * 1 点を埋める。
 *
 * `getAiProviderSettings()` は **平文のトークンを返さない**（状態と下 4 桁だけ）
 * ので、クライアントコンポーネントへ渡しても秘密が HTML に載らない。
 */
export default async function AiProviderSettingsPage() {
  const tr = await getTr();
  const denied = await requireAppRead("ai-provider");
  if (denied) return denied;

  const initial = await getAiProviderSettings();

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[tr("システム"), tr("AI プロバイダ")]}
        title={tr("AI プロバイダ")}
      />
      <AiProviderForm initial={initial} />
    </Stack>
  );
}
