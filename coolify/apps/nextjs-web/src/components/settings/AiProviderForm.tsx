"use client";

import {
  Alert,
  Badge,
  Group,
  NumberInput,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCheck,
  IconPlugConnected,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  type ProbeResult,
  testAiProviderConnection,
  updateAiProviderSettings,
} from "@/app/(dashboard)/settings/ai-provider/actions";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { FormActions, FormSection } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDERS,
  type AiProvider,
  type AiProviderSettings,
  DEFAULT_AI_PROVIDER_SETTINGS,
  isExternalProvider,
  type TokenStatus,
} from "@/lib/ai-provider-core";

interface Props {
  initial: AiProviderSettings & {
    tokenStatus: TokenStatus;
    tokenLast4: string | null;
    encryptionKeyPresent: boolean;
    encryptionKeyEnv: string;
  };
}

/** 保存済みトークンの状態 → 画面の注意書き。 */
function tokenAlert(
  status: TokenStatus,
  keyEnv: string,
): { color: string; message: string } | null {
  switch (status) {
    case "rotate-pending":
      return {
        color: "orange",
        message:
          "暗号鍵が更新されています。設定を保存し直すと、新しい鍵で暗号化されます。",
      };
    case "undecryptable":
      return {
        color: "red",
        message:
          "API トークンを復号できません（暗号鍵が変わった可能性があります）。トークンを入力し直してください。",
      };
    case "no-key":
      return {
        color: "red",
        message: `暗号鍵（${keyEnv}）が未設定のため、API トークンを保存・使用できません。システム管理者へ連絡してください。`,
      };
    default:
      return null;
  }
}

function StageResult({
  label,
  stage,
}: {
  label: string;
  stage: ProbeResult["struct"];
}) {
  const tr = useTr();
  return (
    <Group gap="xs" wrap="nowrap">
      {stage.ok ? (
        <IconCheck color="var(--mantine-color-green-6)" size={16} />
      ) : (
        <IconX color="var(--mantine-color-red-6)" size={16} />
      )}
      <Text fw={500} size="sm">
        {label}
      </Text>
      <Text c="dimmed" ff="mono" size="xs">
        {stage.model || tr("(既定)")}
      </Text>
      <Badge color={stage.ok ? "green" : "red"} variant="light">
        {stage.ok ? `${stage.ms} ms` : tr("失敗")}
      </Badge>
      {stage.error && (
        <Text c="red" size="xs" style={{ minWidth: 0 }} truncate>
          {stage.error}
        </Text>
      )}
    </Group>
  );
}

/**
 * AI プロバイダ設定フォーム（SY0E）。
 *
 * トークンは**書き込み専用** — 保存済みの値は下 4 桁しか表示せず、空欄で保存
 * すれば既存の値を維持する。サーバー側も平文を返さないので、入力欄に入れ戻す
 * 経路がそもそも無い。
 */
export function AiProviderForm({ initial }: Props) {
  const tr = useTr();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);

  const [settings, setSettings] = useState<AiProviderSettings>({
    provider: initial.provider,
    baseUrl: initial.baseUrl,
    visionModel: initial.visionModel,
    structModel: initial.structModel,
    maxOutputTokens: initial.maxOutputTokens,
  });
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);

  const preset = AI_PROVIDER_PRESETS[settings.provider];
  const external = isExternalProvider(settings.provider);
  const alert = tokenAlert(initial.tokenStatus, initial.encryptionKeyEnv);
  const hasStoredToken =
    initial.tokenStatus === "set" || initial.tokenStatus === "rotate-pending";

  const payload = () => ({ settings, token, clearToken });

  // 既定 = ローカル ollama・全欄空。このとき toWireConfig が null を返し、
  // po-extract へヘッダを送らない = 完全に従来どおりの経路になる。
  // **トークンが残っていると既定にならない**（鍵があるとヘッダを送るため）ので、
  // 保存済みトークンがあれば削除も一緒に予約する。保存するまでは何も起きない。
  const isDefault =
    settings.provider === DEFAULT_AI_PROVIDER_SETTINGS.provider &&
    !settings.baseUrl &&
    !settings.visionModel &&
    !settings.structModel &&
    settings.maxOutputTokens === DEFAULT_AI_PROVIDER_SETTINGS.maxOutputTokens &&
    (!hasStoredToken || clearToken);

  const revertToDefault = () => {
    setSettings({ ...DEFAULT_AI_PROVIDER_SETTINGS });
    setToken("");
    setClearToken(hasStoredToken);
    setProbe(null);
  };

  const save = () =>
    startTransition(async () => {
      const res = await updateAiProviderSettings(payload());
      if (res.ok) {
        notifications.show({
          color: "green",
          title: tr("保存しました"),
          message: tr("AI プロバイダの設定を更新しました"),
        });
        setToken("");
        setClearToken(false);
        router.refresh();
      } else {
        notifications.show({
          color: "red",
          title: tr("エラー"),
          message: tr(res.error),
        });
      }
    });

  const test = async () => {
    setTesting(true);
    setProbe(null);
    const res = await testAiProviderConnection(payload());
    setTesting(false);
    if (res.ok) {
      setProbe(res.data);
      const allOk = res.data.struct.ok && res.data.vision.ok;
      notifications.show({
        color: allOk ? "green" : "orange",
        title: allOk ? "接続できました" : tr("一部が失敗しました"),
        message: allOk
          ? tr("構造化・画像読み取りの両方に応答がありました")
          : tr("下の結果を確認してください"),
      });
    } else {
      notifications.show({
        color: "red",
        title: tr("接続テストに失敗"),
        message: tr(res.error),
      });
    }
  };

  return (
    <Stack gap="md">
      {alert && (
        <Alert color={alert.color} icon={<IconAlertTriangle size={16} />}>
          {alert.message}
        </Alert>
      )}

      <FormSection
        description={tr(
          tr(
            tr(
              "注文請書の取込（紙 → JSON）と、AI 補助タスクの両方がこの設定を使います。文字の読み取り（OCR）は常に社内で実行され、外部へは送信しません。",
            ),
          ),
        )}
        title={tr("接続先")}
      >
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Select
              allowDeselect={false}
              data={AI_PROVIDERS.map((p) => ({
                value: p,
                label: AI_PROVIDER_PRESETS[p].label,
              }))}
              description={preset.note}
              label={tr("プロバイダ")}
              onChange={(v) =>
                v && setSettings((s) => ({ ...s, provider: v as AiProvider }))
              }
              value={settings.provider}
            />
            <TextInput
              description={tr("空欄でプロバイダの既定を使用")}
              label={tr("ベース URL")}
              onChange={(e) => {
                // 値は**同期的に**読む。updater の中で e.currentTarget を
                // 読むと、React が updater を呼ぶ頃には dispatch が終わって
                // currentTarget が null に戻っていて落ちる。
                const value = e.currentTarget.value;
                setSettings((s) => ({ ...s, baseUrl: value }));
              }}
              placeholder={preset.baseUrlPlaceholder}
              value={settings.baseUrl}
            />
            <TextInput
              description={tr("注文書の画像を読むモデル")}
              label={tr("画像読み取りモデル")}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setSettings((s) => ({ ...s, visionModel: value }));
              }}
              placeholder={preset.modelPlaceholder}
              value={settings.visionModel}
            />
            <TextInput
              description={tr("空欄なら画像読み取りモデルと同じものを使う")}
              label={tr("構造化モデル")}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setSettings((s) => ({ ...s, structModel: value }));
              }}
              placeholder={preset.modelPlaceholder}
              value={settings.structModel}
            />
          </SimpleGrid>

          <Group gap="sm">
            <GhostButton disabled={isDefault} onClick={revertToDefault}>
              {tr("既定に戻す")}
            </GhostButton>
            <Text c="dimmed" size="xs">
              {isDefault
                ? tr("現在は既定（社内 GPU の Ollama）です")
                : hasStoredToken
                  ? tr(
                      tr(
                        tr(
                          "社内 GPU の Ollama に戻します。保存すると API トークンも削除されます",
                        ),
                      ),
                    )
                  : tr("社内 GPU の Ollama に戻します")}
            </Text>
          </Group>

          {external && (
            <Alert color="orange" icon={<IconWorld size={16} />}>
              {tr(
                tr(
                  tr(
                    "外部の AI\n              サービスを使用します。注文書の画像と読み取り結果が社外へ送信されます。",
                  ),
                ),
              )}
            </Alert>
          )}
        </Stack>
      </FormSection>

      <FormSection
        description={
          external
            ? tr(
                tr(
                  tr(
                    "プロバイダで発行した API トークン。保存後は下 4 桁のみ表示されます。",
                  ),
                ),
              )
            : tr("認証付きの Ollama を使う場合のみ入力してください。")
        }
        title={tr("認証")}
      >
        <Stack gap="sm">
          <PasswordInput
            description={
              hasStoredToken
                ? tr("保存済み: ●●●●●●{v0}（空欄のままにすると変更しません）", {
                    v0: initial.tokenLast4 ?? "",
                  })
                : tr("未設定")
            }
            disabled={clearToken}
            label={tr("API トークン")}
            onChange={(e) => setToken(e.currentTarget.value)}
            placeholder={
              hasStoredToken ? "変更する場合のみ入力" : tr("トークンを貼り付け")
            }
            value={token}
          />
          {hasStoredToken && (
            <Group gap="sm">
              {clearToken ? (
                <>
                  <Text c="red" size="xs">
                    {tr("保存すると、登録済みのトークンを削除します。")}
                  </Text>
                  <GhostButton onClick={() => setClearToken(false)}>
                    {tr("取り消す")}
                  </GhostButton>
                </>
              ) : (
                <GhostButton
                  onClick={() => {
                    setClearToken(true);
                    setToken("");
                  }}
                >
                  {tr("トークンを削除")}
                </GhostButton>
              )}
            </Group>
          )}
          <NumberInput
            description={tr(
              tr("1 回の応答に許す最大トークン数（Anthropic では必須）"),
            )}
            label={tr("最大出力トークン")}
            max={200000}
            min={256}
            onChange={(v) =>
              setSettings((s) => ({
                ...s,
                maxOutputTokens: typeof v === "number" ? v : s.maxOutputTokens,
              }))
            }
            step={1024}
            value={settings.maxOutputTokens}
            w={240}
          />
        </Stack>
      </FormSection>

      <FormSection
        description={tr(
          tr(
            tr(
              "抽出サーバー（po-extract）から実際に 1 回ずつ呼び出して確かめます。保存前の入力でも試せます。",
            ),
          ),
        )}
        title={tr("接続テスト")}
      >
        <Stack gap="sm">
          <Group>
            <SecondaryButton
              leftSection={<IconPlugConnected size={14} />}
              loading={testing}
              onClick={test}
            >
              {tr("接続テスト")}
            </SecondaryButton>
          </Group>
          {probe && (
            <Stack gap="xs">
              <StageResult label={tr("構造化")} stage={probe.struct} />
              <StageResult label={tr("画像読み取り")} stage={probe.vision} />
            </Stack>
          )}
        </Stack>
      </FormSection>

      <FormActions
        loading={isPending}
        onCancel={() => router.back()}
        onSave={save}
      />
    </Stack>
  );
}
