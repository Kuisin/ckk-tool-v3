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
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  type ProbeResult,
  testAiProviderConnection,
  updateAiProviderSettings,
} from "@/app/(dashboard)/settings/ai-provider/actions";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { FieldValue } from "@/components/ui/FieldValue";
import { FormActions, FormSection, SummaryGrid } from "@/components/ui/shells";
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDERS,
  type AiProvider,
  type AiProviderSettings,
  aiProviderLabel,
  aiProviderNote,
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
  tr: ReturnType<typeof useTranslations>,
): { color: string; message: string } | null {
  switch (status) {
    case "rotate-pending":
      return {
        color: "orange",
        message: tr("settings.aiProviderForm.keyRotatedMessage"),
      };
    case "undecryptable":
      return {
        color: "red",
        message: tr("settings.aiProviderForm.cannotDecryptTokenMessage"),
      };
    case "no-key":
      return {
        color: "red",
        message: tr("settings.aiProviderForm.noEncryptionKeyMessage", {
          keyEnv,
        }),
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
  const tr = useTranslations();
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
        {stage.model || tr("settings.aiProviderForm.default")}
      </Text>
      <Badge color={stage.ok ? "green" : "red"} variant="light">
        {stage.ok ? `${stage.ms} ms` : tr("common.failure")}
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
 * AI プロバイダ設定の編集フォーム（EditablePanel の edit）。
 *
 * トークンは**書き込み専用** — 保存済みの値は下 4 桁しか表示せず、空欄で保存
 * すれば既存の値を維持する。サーバー側も平文を返さないので、入力欄に入れ戻す
 * 経路がそもそも無い。
 */
function AiProviderEditor({
  initial,
  onCancel,
  onSaved,
}: Props & { onCancel: () => void; onSaved: () => void }) {
  const tr = useTranslations();
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
  const alert = tokenAlert(initial.tokenStatus, initial.encryptionKeyEnv, tr);
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
          title: tr("common.saved2"),
          message: tr(
            "settings.aiProviderForm.theAiProviderSettingsWereUpdated",
          ),
        });
        setToken("");
        setClearToken(false);
        router.refresh();
        onSaved();
      } else {
        notifications.show({
          color: "red",
          title: tr("common.error2"),
          message: res.error,
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
        title: allOk
          ? tr("settings.aiProviderForm.connectionSucceeded")
          : tr("settings.aiProviderForm.someOfItFailed"),
        message: allOk
          ? tr("settings.aiProviderForm.bothTheStructuredAndVisionReads")
          : tr("settings.aiProviderForm.checkTheResultBelow"),
      });
    } else {
      notifications.show({
        color: "red",
        title: tr("settings.aiProviderForm.theConnectionTestFailed"),
        message: res.error,
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
          "settings.aiProviderForm.bothOrderAcceptanceIntakePaperJson",
        )}
        title={tr("settings.aiProviderForm.endpoint")}
      >
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Select
              allowDeselect={false}
              data={AI_PROVIDERS.map((p) => ({
                value: p,
                label: aiProviderLabel(p, tr),
              }))}
              description={aiProviderNote(settings.provider, tr)}
              label={tr("settings.aiProviderForm.provider")}
              onChange={(v) =>
                v && setSettings((s) => ({ ...s, provider: v as AiProvider }))
              }
              value={settings.provider}
            />
            <TextInput
              description={tr(
                "settings.aiProviderForm.leaveBlankToUseTheProvider",
              )}
              label={tr("settings.aiProviderForm.baseUrl")}
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
              description={tr(
                "settings.aiProviderForm.modelThatReadsTheOrderImage",
              )}
              label={tr("settings.aiProviderForm.visionModel")}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setSettings((s) => ({ ...s, visionModel: value }));
              }}
              placeholder={preset.modelPlaceholder}
              value={settings.visionModel}
            />
            <TextInput
              description={tr("settings.aiProviderForm.ifBlankTheSameModelAs")}
              label={tr("settings.aiProviderForm.structuredModel")}
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
              {tr("settings.aiProviderForm.resetToDefault")}
            </GhostButton>
            <Text c="dimmed" size="xs">
              {isDefault
                ? tr("settings.aiProviderForm.currentlyTheDefaultOllamaOnThe")
                : hasStoredToken
                  ? tr("settings.aiProviderForm.revertsToOllamaOnTheIn")
                  : tr("settings.aiProviderForm.revertsToOllamaOnTheIn2")}
            </Text>
          </Group>

          {external && (
            <Alert color="orange" icon={<IconWorld size={16} />}>
              {tr("settings.aiProviderForm.itUsesAnExternalAiService")}
            </Alert>
          )}
        </Stack>
      </FormSection>

      <FormSection
        description={
          external
            ? tr("settings.aiProviderForm.theApiTokenIssuedByThe")
            : tr("settings.aiProviderForm.onlyFillThisInIfYour")
        }
        title={tr("settings.aiProviderForm.authentication")}
      >
        <Stack gap="sm">
          <PasswordInput
            description={
              hasStoredToken
                ? tr("settings.aiProviderForm.savedTokenMasked", {
                    last4: initial.tokenLast4 ?? "",
                  })
                : tr("common.notSet2")
            }
            disabled={clearToken}
            label={tr("settings.aiProviderForm.aPIToken")}
            onChange={(e) => setToken(e.currentTarget.value)}
            placeholder={
              hasStoredToken
                ? tr("settings.aiProviderForm.enterOnlyToChange")
                : tr("settings.aiProviderForm.pasteTheToken")
            }
            value={token}
          />
          {hasStoredToken && (
            <Group gap="sm">
              {clearToken ? (
                <>
                  <Text c="red" size="xs">
                    {tr("settings.aiProviderForm.savingDeletesTheStoredToken")}
                  </Text>
                  <GhostButton onClick={() => setClearToken(false)}>
                    {tr("common.revoke")}
                  </GhostButton>
                </>
              ) : (
                <GhostButton
                  onClick={() => {
                    setClearToken(true);
                    setToken("");
                  }}
                >
                  {tr("settings.aiProviderForm.deleteTheToken")}
                </GhostButton>
              )}
            </Group>
          )}
          <NumberInput
            description={tr(
              "settings.aiProviderForm.theMaximumTokensAllowedPerResponse",
            )}
            label={tr("settings.aiProviderForm.maxOutputTokens")}
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
          "settings.aiProviderForm.callsTheExtractionServerPoExtract",
        )}
        title={tr("settings.aiProviderForm.testConnection")}
      >
        <Stack gap="sm">
          <Group>
            <SecondaryButton
              leftSection={<IconPlugConnected size={14} />}
              loading={testing}
              onClick={test}
            >
              {tr("settings.aiProviderForm.testConnection")}
            </SecondaryButton>
          </Group>
          {probe && (
            <Stack gap="xs">
              <StageResult
                label={tr("settings.aiProviderForm.structured")}
                stage={probe.struct}
              />
              <StageResult
                label={tr("settings.aiProviderForm.imageReading")}
                stage={probe.vision}
              />
            </Stack>
          )}
        </Stack>
      </FormSection>

      <FormActions loading={isPending} onCancel={onCancel} onSave={save} />
    </Stack>
  );
}

/** AI プロバイダ設定の閲覧モード（EditablePanel の view）。 */
function AiProviderView({ initial }: Props) {
  const tr = useTranslations();
  const alert = tokenAlert(initial.tokenStatus, initial.encryptionKeyEnv, tr);
  const hasStoredToken =
    initial.tokenStatus === "set" || initial.tokenStatus === "rotate-pending";
  const defaultLabel = tr("settings.aiProviderForm.default");

  return (
    <Stack gap="md">
      {alert && (
        <Alert color={alert.color} icon={<IconAlertTriangle size={16} />}>
          {alert.message}
        </Alert>
      )}
      <SummaryGrid>
        <FieldValue
          label={tr("settings.aiProviderForm.provider")}
          value={aiProviderLabel(initial.provider, tr)}
        />
        <FieldValue
          label={tr("settings.aiProviderForm.baseUrl")}
          value={initial.baseUrl || defaultLabel}
        />
        <FieldValue
          label={tr("settings.aiProviderForm.visionModel")}
          value={initial.visionModel || defaultLabel}
        />
        <FieldValue
          label={tr("settings.aiProviderForm.structuredModel")}
          value={initial.structModel || defaultLabel}
        />
        <FieldValue
          label={tr("settings.aiProviderForm.maxOutputTokens")}
          value={initial.maxOutputTokens}
        />
        <FieldValue
          label={tr("settings.aiProviderForm.aPIToken")}
          value={
            hasStoredToken
              ? tr("settings.aiProviderForm.savedTokenMasked", {
                  last4: initial.tokenLast4 ?? "",
                })
              : tr("common.notSet2")
          }
        />
      </SummaryGrid>
    </Stack>
  );
}

/**
 * AI プロバイダ設定（SY0E）。既定は閲覧、編集は「編集」ボタンから
 * （design.md §10.10）。
 */
export function AiProviderForm({ initial }: Props) {
  return (
    <EditablePanel
      canEdit
      edit={({ close }) => (
        <AiProviderEditor initial={initial} onCancel={close} onSaved={close} />
      )}
      view={<AiProviderView initial={initial} />}
    />
  );
}
