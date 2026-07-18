"use client";

/**
 * ItemDefEditForm — 製品項目（SY04）の項目定義を 1 件編集する。
 * 新規（itemKey 無し）/ 既存編集の両対応。保存で定義配列全体を updateProductItemDefs。
 */

import {
  ActionIcon,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateProductItemDefs } from "@/app/(dashboard)/settings/actions";
import { CancelButton, GhostButton, SaveButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  IDENTIFIER,
  PRODUCT_FIELD_TYPES,
  type ProductFieldOption,
  type ProductItemDef,
} from "@/lib/product-types";

const BASE = "/settings/product-items";

const blankDef = (order: number): ProductItemDef => ({
  key: "",
  label: { ja: "", en: "" },
  type: "string",
  required: false,
  order,
  enabled: true,
});

export function ItemDefEditForm({
  allDefs,
  itemKey,
}: {
  allDefs: ProductItemDef[];
  itemKey?: string;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = itemKey != null;
  const existing = allDefs.find((d) => d.key === itemKey);

  const [def, setDef] = useState<ProductItemDef>(
    existing ?? blankDef(allDefs.length),
  );
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<ProductItemDef>) => setDef((d) => ({ ...d, ...p }));

  const setOptions = (options: ProductFieldOption[]) => patch({ options });

  const handleSave = () => {
    // ローカル検証。
    if (!def.label.ja.trim())
      return setError("項目名（日本語）を入力してください");
    if (!IDENTIFIER.test(def.key))
      return setError("キーは英字/アンダースコア始まりの識別子にしてください");
    const dup = allDefs.some((d) => d.key === def.key && d.key !== itemKey);
    if (dup) return setError("同じキーの項目が既に存在します");
    if (def.type === "select" && (def.options ?? []).length === 0)
      return setError("選択肢を1つ以上追加してください");
    if (def.type === "string" && def.pattern) {
      try {
        new RegExp(def.pattern);
      } catch {
        return setError("正規表現が不正です");
      }
    }
    setError(null);

    // 定義配列を組み立て（既存は置換、新規は追加）。
    const next = isEdit
      ? allDefs.map((d) => (d.key === itemKey ? def : d))
      : [...allDefs, def];

    startTransition(async () => {
      const res = await updateProductItemDefs(next);
      if (res.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit ? "項目を更新しました" : "項目を作成しました",
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
          { label: "製品項目", href: BASE },
          isEdit ? "項目編集" : "項目追加",
        ]}
        title={isEdit ? `項目編集 — ${def.label.ja || def.key}` : "項目追加"}
      />

      <FormSection title="項目定義">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            label="項目名（日本語）"
            onChange={(e) =>
              patch({ label: { ...def.label, ja: e.currentTarget.value } })
            }
            placeholder="例: 表面処理"
            value={def.label.ja}
            withAsterisk
          />
          <TextInput
            label="項目名（英語）"
            onChange={(e) =>
              patch({ label: { ...def.label, en: e.currentTarget.value } })
            }
            placeholder="e.g. Surface treatment"
            value={def.label.en}
          />
          <TextInput
            description={
              isEdit
                ? "作成後は変更できません（割り当ての参照を保つため）"
                : "英字/アンダースコア始まりの識別子（例: surfaceTreatment）"
            }
            disabled={isEdit}
            error={error?.includes("キー") ? error : undefined}
            label="キー（識別子）"
            onChange={(e) => patch({ key: e.currentTarget.value })}
            placeholder="surfaceTreatment"
            value={def.key}
            withAsterisk
          />
          <Select
            data={PRODUCT_FIELD_TYPES}
            label="型"
            onChange={(v) =>
              patch({ type: (v as ProductItemDef["type"]) ?? "string" })
            }
            value={def.type}
          />
          <TextInput
            description="種別への割り当て時に上書きできます"
            label="既定値（基本）"
            onChange={(e) => patch({ default: e.currentTarget.value })}
            placeholder={def.type === "boolean" ? "true / false" : "（任意）"}
            value={def.default ?? ""}
          />
          <TextInput
            label="プレースホルダ"
            onChange={(e) => patch({ placeholder: e.currentTarget.value })}
            placeholder="入力例など（任意）"
            value={def.placeholder ?? ""}
          />
        </SimpleGrid>

        <Switch
          checked={def.required}
          label="必須項目にする"
          mt="sm"
          onChange={(e) => patch({ required: e.currentTarget.checked })}
        />

        {def.type === "string" && (
          <TextInput
            description="入力形式を制限する正規表現（例: ^[A-Z]{2}-\d{4}$）。空欄なら制限なし。"
            error={error?.includes("正規表現") ? error : undefined}
            label="パターン（正規表現）"
            mt="sm"
            onChange={(e) =>
              patch({ pattern: e.currentTarget.value || undefined })
            }
            placeholder="^[A-Z]{2}-\d{4}$"
            value={def.pattern ?? ""}
          />
        )}

        {def.type === "number" && (
          <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
            <NumberInput
              label="最小値"
              onChange={(v) =>
                patch({ min: v === "" || v == null ? undefined : Number(v) })
              }
              value={def.min ?? ""}
            />
            <NumberInput
              label="最大値"
              onChange={(v) =>
                patch({ max: v === "" || v == null ? undefined : Number(v) })
              }
              value={def.max ?? ""}
            />
          </SimpleGrid>
        )}

        {def.type === "select" && (
          <Stack gap={4} mt="sm">
            <Text c="dimmed" size="xs">
              選択肢（値 = 保存される値、ラベル = 画面表示）
            </Text>
            {(def.options ?? []).map((o, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: option rows have no stable id
              <Group gap="xs" key={i} wrap="nowrap">
                <TextInput
                  onChange={(e) =>
                    setOptions(
                      (def.options ?? []).map((x, j) =>
                        j === i ? { ...x, value: e.currentTarget.value } : x,
                      ),
                    )
                  }
                  placeholder="値"
                  style={{ flex: 1 }}
                  value={o.value}
                />
                <TextInput
                  onChange={(e) =>
                    setOptions(
                      (def.options ?? []).map((x, j) =>
                        j === i ? { ...x, label: e.currentTarget.value } : x,
                      ),
                    )
                  }
                  placeholder="表示ラベル"
                  style={{ flex: 1 }}
                  value={o.label}
                />
                <ActionIcon
                  aria-label="選択肢を削除"
                  color="red"
                  onClick={() =>
                    setOptions((def.options ?? []).filter((_, j) => j !== i))
                  }
                  variant="default"
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))}
            <GhostButton
              leftSection={<IconPlus size={12} />}
              onClick={() =>
                setOptions([...(def.options ?? []), { value: "", label: "" }])
              }
              size="compact-xs"
            >
              選択肢を追加
            </GhostButton>
          </Stack>
        )}

        {error && !error.includes("キー") && (
          <Text c="red" mt="sm" size="sm">
            {error}
          </Text>
        )}
      </FormSection>

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
