"use client";

/**
 * DisplayProfilesPanel — 表示内容（プロファイル）の一覧と編集。
 *
 * 「何を映すか」を端末から切り離して持つ場所。1 つの内容を複数の画面に
 * 出せるので、掲示の差し替えは端末を 1 台ずつ触らずに済む。
 *
 * 種別ごとに設定の形が違うので、フォームも種別で切り替える。中身の検証は
 * サーバー側の 1 か所（DISPLAY_CONTENT_SCHEMAS）が正で、ここは入力の器。
 */

import {
  Badge,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteDisplayProfile,
  saveDisplayProfile,
} from "@/app/(dashboard)/settings/kiosk-devices/displays/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  DangerButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { ListShell } from "@/components/ui/shells";
import {
  DISPLAY_TEMPLATES,
  defaultTemplateOptions,
  findDisplayTemplate,
} from "@/lib/display-templates";
import type { DisplayProfileRow } from "@/lib/displays-admin";
import { TemplateOptionFields } from "./TemplateOptionFields";

const CONTENT_TYPE_LABEL: Record<string, string> = {
  APP_PAGE: "アプリの画面",
  METABASE: "集計ダッシュボード",
  URL: "外部ページ",
  IMAGE: "画像",
};

type Draft = {
  id?: string;
  nameJa: string;
  description: string;
  contentType: "APP_PAGE" | "METABASE" | "URL" | "IMAGE";
  refreshIntervalSec: number;
  isEnabled: boolean;
  // 種別ごとの入力（使う欄だけ意味を持つ）
  page: string;
  /** APP_PAGE のときのテンプレート設定（登録簿の宣言から描く）。 */
  options: Record<string, unknown>;
  dashboardId: string;
  params: string;
  url: string;
  fileId: string;
};

function emptyDraft(): Draft {
  return {
    nameJa: "",
    description: "",
    contentType: "APP_PAGE",
    refreshIntervalSec: 60,
    isEnabled: true,
    page: DISPLAY_TEMPLATES[0].key,
    options: defaultTemplateOptions(DISPLAY_TEMPLATES[0]),
    dashboardId: "",
    params: "",
    url: "",
    fileId: "",
  };
}

function toDraft(row: DisplayProfileRow): Draft {
  const c = (row.contentConfig ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    nameJa: row.nameJson?.ja ?? row.name ?? "",
    description: row.description ?? "",
    contentType: row.contentType,
    refreshIntervalSec: row.refreshIntervalSec,
    isEnabled: row.isEnabled,
    page: String(c.page ?? DISPLAY_TEMPLATES[0].key),
    options:
      (c.options as Record<string, unknown> | undefined) ??
      defaultTemplateOptions(
        findDisplayTemplate(String(c.page)) ?? DISPLAY_TEMPLATES[0],
      ),
    dashboardId: c.dashboardId == null ? "" : String(c.dashboardId),
    params: c.params ? JSON.stringify(c.params, null, 2) : "",
    url: String(c.url ?? ""),
    fileId: String(c.fileId ?? ""),
  };
}

/** 入力欄 → content_config。**形の正はサーバー側**なので、ここは素直に組むだけ。 */
function toConfig(
  d: Draft,
): { ok: true; value: unknown } | { ok: false; error: string } {
  switch (d.contentType) {
    case "APP_PAGE":
      return { ok: true, value: { page: d.page, options: d.options } };
    case "METABASE": {
      let params: unknown = {};
      if (d.params.trim()) {
        try {
          params = JSON.parse(d.params);
        } catch {
          return {
            ok: false,
            error: "絞り込みの書式（JSON）が正しくありません",
          };
        }
      }
      return {
        ok: true,
        value: { dashboardId: Number(d.dashboardId), params },
      };
    }
    case "URL":
      return { ok: true, value: { url: d.url.trim() } };
    case "IMAGE":
      return { ok: true, value: { fileId: d.fileId.trim() } };
    default:
      return { ok: false, error: "種別が不正です" };
  }
}

type Props = {
  rows: DisplayProfileRow[];
  plantOptions: Array<{ value: string; label: string }>;
};

export function DisplayProfilesPanel({ rows, plantOptions }: Props) {
  const router = useRouter();
  const fmt = useFormat();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);

  const save = () => {
    if (!draft) return;
    const config = toConfig(draft);
    if (!config.ok) {
      notifications.show({
        title: "エラー",
        message: config.error,
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const result = await saveDisplayProfile({
        id: draft.id,
        nameJa: draft.nameJa,
        description: draft.description || undefined,
        contentType: draft.contentType,
        contentConfig: config.value,
        refreshIntervalSec: draft.refreshIntervalSec,
        isEnabled: draft.isEnabled,
      });
      if (!result.ok) {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
        return;
      }
      notifications.show({ message: "保存しました", color: "green" });
      setDraft(null);
      router.refresh();
    });
  };

  const confirmDelete = (row: DisplayProfileRow) =>
    modals.openConfirmModal({
      title: "表示内容の削除",
      children: <Text size="sm">この操作は取り消せません。</Text>,
      labels: { confirm: "削除", cancel: "戻る" },
      confirmProps: { color: "red" },
      onConfirm: () =>
        startTransition(async () => {
          const result = await deleteDisplayProfile(row.id);
          if (!result.ok) {
            notifications.show({
              title: "エラー",
              message: result.error,
              color: "red",
            });
            return;
          }
          notifications.show({ message: "削除しました", color: "green" });
          router.refresh();
        }),
    });

  return (
    <ListShell
      action={
        <Group gap="xs">
          <SecondaryButton href="/settings/kiosk-devices">
            ディスプレイ一覧
          </SecondaryButton>
          <PrimaryButton
            leftSection={<IconPlus size={16} />}
            onClick={() => setDraft(emptyDraft())}
          >
            表示内容を追加
          </PrimaryButton>
        </Group>
      }
      breadcrumbs={[
        { label: "システム" },
        { label: "ディスプレイ管理", href: "/settings/kiosk-devices" },
        { label: "表示内容" },
      ]}
      title="表示内容"
    >
      <Stack gap="md">
        {draft && (
          <Paper p="md" radius="md" withBorder>
            <Stack gap="md">
              <Text fw={600}>
                {draft.id ? "表示内容を編集" : "表示内容を追加"}
              </Text>

              <TextInput
                label="名前"
                onChange={(e) =>
                  setDraft({ ...draft, nameJa: e.currentTarget.value })
                }
                placeholder="A ライン 生産状況"
                value={draft.nameJa}
                withAsterisk
              />

              <Textarea
                autosize
                label="説明"
                minRows={2}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.currentTarget.value })
                }
                value={draft.description}
              />

              <Select
                data={Object.entries(CONTENT_TYPE_LABEL).map(([v, l]) => ({
                  value: v,
                  label: l,
                }))}
                label="種別"
                onChange={(v) =>
                  v &&
                  setDraft({ ...draft, contentType: v as Draft["contentType"] })
                }
                value={draft.contentType}
              />

              {draft.contentType === "APP_PAGE" &&
                (() => {
                  const template =
                    findDisplayTemplate(draft.page) ?? DISPLAY_TEMPLATES[0];
                  return (
                    <>
                      <Select
                        data={DISPLAY_TEMPLATES.map((t) => ({
                          value: t.key,
                          label: t.label,
                        }))}
                        description={template.description}
                        label="画面"
                        onChange={(v) => {
                          const next = findDisplayTemplate(v ?? "");
                          if (!next) return;
                          // 画面を替えたら設定も作り直す（前の画面の設定が
                          // 残っていると、保存時に落ちるか黙って無視される）
                          setDraft({
                            ...draft,
                            page: next.key,
                            options: defaultTemplateOptions(next),
                          });
                        }}
                        value={template.key}
                      />
                      <TemplateOptionFields
                        onChange={(key, value) =>
                          setDraft({
                            ...draft,
                            options: { ...draft.options, [key]: value },
                          })
                        }
                        plantOptions={plantOptions}
                        template={template}
                        values={draft.options}
                      />
                    </>
                  );
                })()}

              {draft.contentType === "METABASE" && (
                <>
                  <TextInput
                    description="Metabase のダッシュボード番号"
                    label="ダッシュボード ID"
                    onChange={(e) =>
                      setDraft({ ...draft, dashboardId: e.currentTarget.value })
                    }
                    placeholder="14"
                    value={draft.dashboardId}
                    withAsterisk
                  />
                  <Textarea
                    autosize
                    description='例: {"plant_id": "NAGOYA"}。Metabase 側でこの項目を「ロック」に設定してください'
                    label="絞り込み（JSON）"
                    minRows={3}
                    onChange={(e) =>
                      setDraft({ ...draft, params: e.currentTarget.value })
                    }
                    value={draft.params}
                  />
                </>
              )}

              {draft.contentType === "URL" && (
                <TextInput
                  label="URL"
                  onChange={(e) =>
                    setDraft({ ...draft, url: e.currentTarget.value })
                  }
                  placeholder="https://example.com/board"
                  value={draft.url}
                  withAsterisk
                />
              )}

              {draft.contentType === "IMAGE" && (
                <TextInput
                  description="ファイル管理（SY06）でアップロードした画像の ID"
                  label="画像のファイル ID"
                  onChange={(e) =>
                    setDraft({ ...draft, fileId: e.currentTarget.value })
                  }
                  value={draft.fileId}
                  withAsterisk
                />
              )}

              <NumberInput
                description="0 にすると自動では読み直しません（変更時の通知だけで切り替わります）"
                label="再読込の間隔（秒）"
                max={86_400}
                min={0}
                onChange={(v) =>
                  setDraft({ ...draft, refreshIntervalSec: Number(v) || 0 })
                }
                value={draft.refreshIntervalSec}
              />

              <Switch
                checked={draft.isEnabled}
                label="この表示内容を使えるようにする"
                onChange={(e) =>
                  setDraft({ ...draft, isEnabled: e.currentTarget.checked })
                }
              />

              <Group justify="flex-end">
                <SecondaryButton
                  disabled={pending}
                  onClick={() => setDraft(null)}
                >
                  キャンセル
                </SecondaryButton>
                <PrimaryButton loading={pending} onClick={save}>
                  保存
                </PrimaryButton>
              </Group>
            </Stack>
          </Paper>
        )}

        {rows.length === 0 ? (
          <Text c="dimmed" py="xl" size="sm" ta="center">
            表示内容がまだありません。「表示内容を追加」から作成してください。
          </Text>
        ) : (
          <Stack gap={0}>
            {rows.map((row, i) => (
              <Group
                align="center"
                gap="md"
                key={row.id}
                py="sm"
                style={{
                  borderTop:
                    i === 0
                      ? undefined
                      : "1px solid var(--mantine-color-default-border)",
                }}
                wrap="nowrap"
              >
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="xs" wrap="nowrap">
                    <Text fw={600} size="sm" truncate>
                      {row.name ?? "（名称未設定）"}
                    </Text>
                    {!row.isEnabled && (
                      <Badge color="gray" size="sm" variant="light">
                        無効
                      </Badge>
                    )}
                  </Group>
                  <Text c="dimmed" size="xs" truncate>
                    {row.description || CONTENT_TYPE_LABEL[row.contentType]}
                  </Text>
                </Stack>

                <Badge size="sm" variant="light" w={140}>
                  {CONTENT_TYPE_LABEL[row.contentType] ?? row.contentType}
                </Badge>

                <Text c="dimmed" size="xs" ta="right" w={90}>
                  {row.deviceCount} 台で使用
                </Text>

                <Text c="dimmed" size="xs" ta="right" w={120}>
                  {fmt.dateTime(row.updatedAt)}
                </Text>

                <Group gap="xs" wrap="nowrap">
                  <SecondaryButton
                    disabled={pending}
                    onClick={() => setDraft(toDraft(row))}
                  >
                    編集
                  </SecondaryButton>
                  <DangerButton
                    disabled={pending || row.deviceCount > 0}
                    onClick={() => confirmDelete(row)}
                  >
                    削除
                  </DangerButton>
                </Group>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </ListShell>
  );
}
