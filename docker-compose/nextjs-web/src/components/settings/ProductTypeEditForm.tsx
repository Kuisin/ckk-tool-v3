"use client";

/**
 * ProductTypeEditForm — 製品項目（SY04）の製品種別を 1 件編集する。
 * 種別の基本情報 + 項目の割り当て（項目定義の参照 + 任意の既定値上書き）を編集。
 * 保存で種別配列全体を updateProductTypes。
 */

import {
  ActionIcon,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateProductTypes } from "@/app/(dashboard)/settings/actions";
import { CancelButton, GhostButton, SaveButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  PRODUCT_FIELD_TYPES,
  type ProductItemDef,
  type ProductType,
  type ProductTypeAssignment,
} from "@/lib/product-types";

const BASE = "/settings/product-types";

const typeLabel = (v: string) =>
  PRODUCT_FIELD_TYPES.find((o) => o.value === v)?.label ?? v;

function newId(): string {
  return crypto.randomUUID();
}

export function ProductTypeEditForm({
  allTypes,
  typeId,
  defs,
}: {
  allTypes: ProductType[];
  typeId?: string;
  defs: ProductItemDef[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = typeId != null;
  const existing = allTypes.find((t) => t.id === typeId);

  const [type, setType] = useState<ProductType>(
    existing ?? {
      id: newId(),
      name: { ja: "", en: "" },
      description: "",
      enabled: true,
      order: allTypes.length,
      assignments: [],
    },
  );
  const [error, setError] = useState<string | null>(null);

  const defByKey = new Map(defs.map((d) => [d.key, d]));
  const defOptions = defs
    .filter((d) => d.enabled)
    .map((d) => ({
      value: d.key,
      label: `${d.label.ja || d.key}（${typeLabel(d.type)}）`,
    }));

  const patch = (p: Partial<ProductType>) => setType((t) => ({ ...t, ...p }));

  const setAssignments = (assignments: ProductTypeAssignment[]) =>
    patch({ assignments: assignments.map((a, i) => ({ ...a, order: i })) });

  const patchAssign = (i: number, p: Partial<ProductTypeAssignment>) =>
    setAssignments(
      type.assignments.map((a, j) => (j === i ? { ...a, ...p } : a)),
    );

  const addAssign = () =>
    setAssignments([
      ...type.assignments,
      { itemKey: "", order: type.assignments.length },
    ]);

  const removeAssign = (i: number) =>
    setAssignments(type.assignments.filter((_, j) => j !== i));

  const moveAssign = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= type.assignments.length) return;
    const next = type.assignments.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setAssignments(next);
  };

  const handleSave = () => {
    if (!type.name.ja.trim())
      return setError("種別名（日本語）を入力してください");
    const seen = new Set<string>();
    for (const a of type.assignments) {
      if (!a.itemKey) return setError("割り当てる項目を選択してください");
      if (seen.has(a.itemKey))
        return setError("同じ項目が重複して割り当てられています");
      seen.add(a.itemKey);
    }
    setError(null);

    const next = isEdit
      ? allTypes.map((t) => (t.id === typeId ? type : t))
      : [...allTypes, type];

    startTransition(async () => {
      const res = await updateProductTypes(next);
      if (res.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit ? "製品種別を更新しました" : "製品種別を作成しました",
          color: "green",
        });
        router.push(BASE);
      } else {
        notifications.show({
          title: "エラー",
          message: res.error,
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          "システム",
          { label: "製品種別", href: BASE },
          isEdit ? "種別編集" : "種別追加",
        ]}
        title={isEdit ? `種別編集 — ${type.name.ja || type.id}` : "種別追加"}
      />

      <FormSection title="種別情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            label="種別名（日本語）"
            onChange={(e) =>
              patch({ name: { ...type.name, ja: e.currentTarget.value } })
            }
            placeholder="例: 標準品"
            value={type.name.ja}
            withAsterisk
          />
          <TextInput
            label="種別名（英語）"
            onChange={(e) =>
              patch({ name: { ...type.name, en: e.currentTarget.value } })
            }
            placeholder="e.g. Standard"
            value={type.name.en}
          />
        </SimpleGrid>
        <Textarea
          label="説明"
          mt="sm"
          onChange={(e) => patch({ description: e.currentTarget.value })}
          placeholder="この種別の用途など（任意）"
          rows={2}
          value={type.description ?? ""}
        />
        <Switch
          checked={type.enabled}
          label="有効（製品作成の選択肢に出す）"
          mt="sm"
          onChange={(e) => patch({ enabled: e.currentTarget.checked })}
        />
      </FormSection>

      <FormSection
        description="項目定義ライブラリから割り当てます。既定値は空欄なら項目定義の既定値を使います。"
        title="割り当て項目"
      >
        <Stack gap="sm">
          {type.assignments.length === 0 && (
            <Text c="dimmed" size="sm">
              まだ項目が割り当てられていません。
            </Text>
          )}
          {type.assignments.map((a, i) => {
            const def = defByKey.get(a.itemKey);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: assignment rows have no stable id
              <Paper key={i} p="sm" radius="sm" withBorder>
                <Group align="flex-end" gap="sm" wrap="nowrap">
                  <Select
                    data={defOptions}
                    label="項目"
                    onChange={(v) => patchAssign(i, { itemKey: v ?? "" })}
                    placeholder="項目を選択"
                    searchable
                    style={{ flex: 1 }}
                    value={a.itemKey || null}
                  />
                  {def?.type === "select" ? (
                    <Select
                      clearable
                      data={(def.options ?? []).map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      description="既定値（上書き・任意）"
                      label="既定値（上書き）"
                      onChange={(v) =>
                        patchAssign(i, { defaultValue: v || undefined })
                      }
                      placeholder={def.default ?? "（任意）"}
                      style={{ flex: 1 }}
                      value={a.defaultValue ?? null}
                    />
                  ) : (
                    <TextInput
                      description={
                        def?.default ? `未入力なら "${def.default}"` : "任意"
                      }
                      label="既定値（上書き）"
                      onChange={(e) =>
                        patchAssign(i, {
                          defaultValue: e.currentTarget.value || undefined,
                        })
                      }
                      placeholder={def?.default ?? "（任意）"}
                      style={{ flex: 1 }}
                      value={a.defaultValue ?? ""}
                    />
                  )}
                  <ActionIcon.Group>
                    <ActionIcon
                      aria-label="上へ"
                      disabled={i === 0}
                      onClick={() => moveAssign(i, -1)}
                      variant="default"
                    >
                      <IconArrowUp size={16} />
                    </ActionIcon>
                    <ActionIcon
                      aria-label="下へ"
                      disabled={i === type.assignments.length - 1}
                      onClick={() => moveAssign(i, 1)}
                      variant="default"
                    >
                      <IconArrowDown size={16} />
                    </ActionIcon>
                    <ActionIcon
                      aria-label="割り当てを削除"
                      color="red"
                      onClick={() => removeAssign(i)}
                      variant="default"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </ActionIcon.Group>
                </Group>
              </Paper>
            );
          })}
          <GhostButton
            fullWidth={isMobile}
            leftSection={<IconPlus size={14} />}
            onClick={addAssign}
          >
            項目を割り当て
          </GhostButton>
          {defOptions.length === 0 && (
            <Text c="dimmed" size="xs">
              割り当て可能な項目がありません。先に「項目定義」で項目を作成してください。
            </Text>
          )}
        </Stack>
      </FormSection>

      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}

      <Group justify={isMobile ? "stretch" : "flex-end"}>
        <CancelButton fullWidth={isMobile} onClick={() => router.push(BASE)} />
        <SaveButton
          fullWidth={isMobile}
          loading={isPending}
          onClick={handleSave}
        >
          保存
        </SaveButton>
      </Group>
    </Stack>
  );
}
