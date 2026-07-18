"use client";

/**
 * ProductTypesForm — 製品種別（SY04）の設定フォーム。
 *
 * 種別（テンプレート）とその「予め決めた入力項目（items）」を編集し「保存」で永続化。
 * 各項目は型（文字列/数値/真偽/選択/日付）を持ち、新規製品作成時にその型で入力検証する。
 */

import {
  ActionIcon,
  Alert,
  Divider,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconChevronDown,
  IconChevronUp,
  IconInfoCircle,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState, useTransition } from "react";
import { updateProductTypes } from "@/app/(dashboard)/settings/actions";
import { GhostButton, SaveButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  PRODUCT_FIELD_TYPES,
  type ProductType,
  type ProductTypeItem,
} from "@/lib/product-types";

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next.map((v, i) => ({ ...v, order: i }) as T);
}

export function ProductTypesForm({ initial }: { initial: ProductType[] }) {
  const isMobile = useIsMobile();
  const [types, setTypes] = useState<ProductType[]>(
    [...initial].sort((a, b) => a.order - b.order),
  );
  const [isPending, startTransition] = useTransition();

  const patchType = (ti: number, p: Partial<ProductType>) =>
    setTypes((ts) => ts.map((t, i) => (i === ti ? { ...t, ...p } : t)));

  const patchItem = (ti: number, ii: number, p: Partial<ProductTypeItem>) =>
    setTypes((ts) =>
      ts.map((t, i) =>
        i === ti
          ? {
              ...t,
              items: t.items.map((it, j) => (j === ii ? { ...it, ...p } : it)),
            }
          : t,
      ),
    );

  const addType = () =>
    setTypes((ts) => [
      ...ts,
      {
        id: crypto.randomUUID(),
        name: { ja: "", en: "" },
        description: "",
        enabled: true,
        order: ts.length,
        items: [],
      },
    ]);

  const removeType = (ti: number) =>
    setTypes((ts) =>
      ts.filter((_, i) => i !== ti).map((t, i) => ({ ...t, order: i })),
    );

  const moveType = (ti: number, dir: -1 | 1) =>
    setTypes((ts) => move(ts, ti, ti + dir));

  const addItem = (ti: number) =>
    setTypes((ts) =>
      ts.map((t, i) =>
        i === ti
          ? {
              ...t,
              items: [
                ...t.items,
                {
                  key: `item${t.items.length + 1}`,
                  label: { ja: "", en: "" },
                  type: "string" as const,
                  required: false,
                  order: t.items.length,
                },
              ],
            }
          : t,
      ),
    );

  const removeItem = (ti: number, ii: number) =>
    setTypes((ts) =>
      ts.map((t, i) =>
        i === ti
          ? {
              ...t,
              items: t.items
                .filter((_, j) => j !== ii)
                .map((it, j) => ({ ...it, order: j })),
            }
          : t,
      ),
    );

  const moveItem = (ti: number, ii: number, dir: -1 | 1) =>
    setTypes((ts) =>
      ts.map((t, i) =>
        i === ti ? { ...t, items: move(t.items, ii, ii + dir) } : t,
      ),
    );

  // キーのバリデーション（識別子・種別内で一意）を可視化。
  const keyErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    for (const t of types) {
      const seen = new Set<string>();
      t.items.forEach((it, ii) => {
        const id = `${t.id}:${ii}`;
        if (it.key && !IDENTIFIER.test(it.key)) errs[id] = "識別子で入力";
        else if (it.key && seen.has(it.key)) errs[id] = "キー重複";
        seen.add(it.key);
      });
    }
    return errs;
  }, [types]);

  const handleSave = () => {
    if (Object.keys(keyErrors).length > 0) {
      notifications.show({
        title: "エラー",
        message: "項目キーを修正してください（識別子・重複）",
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const result = await updateProductTypes(types);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: "製品種別を更新しました",
          color: "green",
        });
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <SaveButton
            fullWidth={isMobile}
            loading={isPending}
            onClick={handleSave}
          >
            保存
          </SaveButton>
        }
        breadcrumbs={["システム", "製品種別"]}
        title="製品種別"
      />

      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        種別ごとに、新規製品作成時に展開する入力項目をあらかじめ定義します。各項目は型
        （文字列/数値/真偽/選択/日付）を持ち、入力はその型で検証されます。入力値は製品の
        仕様（spec）として保存されます。
      </Alert>

      <FormSection
        description="上から順に表示されます。無効にした種別は製品作成の選択肢に出ません。"
        title="種別一覧"
      >
        <Stack gap="md">
          {types.length === 0 && (
            <Text c="dimmed" size="sm">
              種別がありません。「種別を追加」から作成してください。
            </Text>
          )}

          {types.map((t, ti) => (
            <Paper key={t.id} p="md" radius="md" withBorder>
              <Group align="flex-end" gap="sm" wrap="nowrap">
                <TextInput
                  label="種別名（日本語）"
                  onChange={(e) =>
                    patchType(ti, {
                      name: { ...t.name, ja: e.currentTarget.value },
                    })
                  }
                  placeholder="例: 標準品"
                  style={{ flex: 1 }}
                  value={t.name.ja}
                  withAsterisk
                />
                <TextInput
                  label="種別名（英語）"
                  onChange={(e) =>
                    patchType(ti, {
                      name: { ...t.name, en: e.currentTarget.value },
                    })
                  }
                  placeholder="e.g. Standard"
                  style={{ flex: 1 }}
                  value={t.name.en}
                />
                <Switch
                  checked={t.enabled}
                  label="有効"
                  onChange={(e) =>
                    patchType(ti, { enabled: e.currentTarget.checked })
                  }
                />
                <ActionIcon.Group>
                  <ActionIcon
                    aria-label="上へ"
                    disabled={ti === 0}
                    onClick={() => moveType(ti, -1)}
                    variant="default"
                  >
                    <IconChevronUp size={16} />
                  </ActionIcon>
                  <ActionIcon
                    aria-label="下へ"
                    disabled={ti === types.length - 1}
                    onClick={() => moveType(ti, 1)}
                    variant="default"
                  >
                    <IconChevronDown size={16} />
                  </ActionIcon>
                  <ActionIcon
                    aria-label="種別を削除"
                    color="red"
                    onClick={() => removeType(ti)}
                    variant="default"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </ActionIcon.Group>
              </Group>

              <TextInput
                label="説明"
                mt="sm"
                onChange={(e) =>
                  patchType(ti, { description: e.currentTarget.value })
                }
                placeholder="この種別の用途など（任意）"
                value={t.description ?? ""}
              />

              <Divider label="入力項目" labelPosition="left" my="md" />

              <Stack gap="sm">
                {t.items.length === 0 && (
                  <Text c="dimmed" size="sm">
                    項目がありません。
                  </Text>
                )}
                {t.items.map((it, ii) => (
                  <Paper
                    bg="var(--mantine-color-body)"
                    // biome-ignore lint/suspicious/noArrayIndexKey: items have no stable id
                    key={ii}
                    p="sm"
                    radius="sm"
                    withBorder
                  >
                    <SimpleGrid cols={isMobile ? 1 : 3} spacing="xs">
                      <TextInput
                        label="項目名（日本語）"
                        onChange={(e) =>
                          patchItem(ti, ii, {
                            label: { ...it.label, ja: e.currentTarget.value },
                          })
                        }
                        placeholder="例: 表面処理"
                        size="xs"
                        value={it.label.ja}
                      />
                      <TextInput
                        label="項目名（英語）"
                        onChange={(e) =>
                          patchItem(ti, ii, {
                            label: { ...it.label, en: e.currentTarget.value },
                          })
                        }
                        size="xs"
                        value={it.label.en}
                      />
                      <TextInput
                        error={keyErrors[`${t.id}:${ii}`]}
                        label="キー（識別子）"
                        onChange={(e) =>
                          patchItem(ti, ii, { key: e.currentTarget.value })
                        }
                        placeholder="surfaceTreatment"
                        size="xs"
                        value={it.key}
                      />
                      <Select
                        data={PRODUCT_FIELD_TYPES}
                        label="型"
                        onChange={(v) =>
                          patchItem(ti, ii, {
                            type: (v as ProductTypeItem["type"]) ?? "string",
                          })
                        }
                        size="xs"
                        value={it.type}
                      />
                      <TextInput
                        label="既定値"
                        onChange={(e) =>
                          patchItem(ti, ii, { default: e.currentTarget.value })
                        }
                        placeholder={
                          it.type === "boolean" ? "true / false" : "（任意）"
                        }
                        size="xs"
                        value={it.default ?? ""}
                      />
                      <Group align="flex-end" gap="xs" wrap="nowrap">
                        <Switch
                          checked={it.required}
                          label="必須"
                          onChange={(e) =>
                            patchItem(ti, ii, {
                              required: e.currentTarget.checked,
                            })
                          }
                          size="sm"
                        />
                        <ActionIcon
                          aria-label="上へ"
                          disabled={ii === 0}
                          onClick={() => moveItem(ti, ii, -1)}
                          variant="default"
                        >
                          <IconChevronUp size={14} />
                        </ActionIcon>
                        <ActionIcon
                          aria-label="下へ"
                          disabled={ii === t.items.length - 1}
                          onClick={() => moveItem(ti, ii, 1)}
                          variant="default"
                        >
                          <IconChevronDown size={14} />
                        </ActionIcon>
                        <ActionIcon
                          aria-label="項目を削除"
                          color="red"
                          onClick={() => removeItem(ti, ii)}
                          variant="default"
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </SimpleGrid>

                    {it.type === "number" && (
                      <SimpleGrid cols={isMobile ? 1 : 2} mt="xs" spacing="xs">
                        <NumberInput
                          label="最小値"
                          onChange={(v) =>
                            patchItem(ti, ii, {
                              min:
                                v === "" || v == null ? undefined : Number(v),
                            })
                          }
                          size="xs"
                          value={it.min ?? ""}
                        />
                        <NumberInput
                          label="最大値"
                          onChange={(v) =>
                            patchItem(ti, ii, {
                              max:
                                v === "" || v == null ? undefined : Number(v),
                            })
                          }
                          size="xs"
                          value={it.max ?? ""}
                        />
                      </SimpleGrid>
                    )}

                    {it.type === "select" && (
                      <SelectOptionsEditor
                        onChange={(options) => patchItem(ti, ii, { options })}
                        options={it.options ?? []}
                      />
                    )}
                  </Paper>
                ))}
                <GhostButton
                  fullWidth={isMobile}
                  leftSection={<IconPlus size={14} />}
                  onClick={() => addItem(ti)}
                >
                  項目を追加
                </GhostButton>
              </Stack>
            </Paper>
          ))}

          <GhostButton
            fullWidth={isMobile}
            leftSection={<IconPlus size={16} />}
            onClick={addType}
          >
            種別を追加
          </GhostButton>
        </Stack>
      </FormSection>

      {!isMobile && (
        <Group justify="flex-end">
          <SaveButton loading={isPending} onClick={handleSave}>
            保存
          </SaveButton>
        </Group>
      )}
    </Stack>
  );
}

/** select 型の選択肢（value/label）を編集する小コンポーネント。 */
function SelectOptionsEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string }[];
  onChange: (o: { value: string; label: string }[]) => void;
}) {
  const set = (i: number, p: Partial<{ value: string; label: string }>) =>
    onChange(options.map((o, j) => (j === i ? { ...o, ...p } : o)));
  return (
    <Stack gap={4} mt="xs">
      <Text c="dimmed" size="xs">
        選択肢
      </Text>
      {options.map((o, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: option rows have no stable id
        <Group gap="xs" key={i} wrap="nowrap">
          <TextInput
            onChange={(e) => set(i, { value: e.currentTarget.value })}
            placeholder="値（保存される値）"
            size="xs"
            style={{ flex: 1 }}
            value={o.value}
          />
          <TextInput
            onChange={(e) => set(i, { label: e.currentTarget.value })}
            placeholder="表示ラベル"
            size="xs"
            style={{ flex: 1 }}
            value={o.label}
          />
          <ActionIcon
            aria-label="選択肢を削除"
            color="red"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            variant="default"
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
      <GhostButton
        leftSection={<IconPlus size={12} />}
        onClick={() => onChange([...options, { value: "", label: "" }])}
        size="compact-xs"
      >
        選択肢を追加
      </GhostButton>
    </Stack>
  );
}
