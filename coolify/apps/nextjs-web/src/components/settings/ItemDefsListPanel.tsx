"use client";

/**
 * ItemDefsListPanel — 製品項目（SY03）の項目定義一覧。
 *
 * 一覧は SettingsReorderableList（有効切替・並び替え・削除・追加）。
 * 各項目の編集は行クリックで /settings/product-items/[key] へ。
 */

import { Badge, Group, Text } from "@mantine/core";
import { IconListDetails } from "@tabler/icons-react";
import { updateProductItemDefs } from "@/app/(dashboard)/settings/actions";
import { SettingsReorderableList } from "@/components/settings/SettingsReorderableList";
import { useTr } from "@/hooks/useTr";
import { PRODUCT_FIELD_TYPES, type ProductItemDef } from "@/lib/product-types";

const BASE = "/settings/product-items";

const typeLabel = (v: string) =>
  PRODUCT_FIELD_TYPES.find((o) => o.value === v)?.label ?? v;

export function ItemDefsListPanel({ initial }: { initial: ProductItemDef[] }) {
  const tr = useTr();
  return (
    <SettingsReorderableList
      addLabel={tr("項目を追加")}
      deleteConfirm={(d) => ({
        title: tr("項目定義の削除"),
        message: `「${d.label.ja || d.key}」を削除しますか？種別への割り当ても外れます。`,
      })}
      description={tr(
        tr(
          tr(
            "再利用できる入力項目のライブラリです。製品種別に割り当てて使います。",
          ),
        ),
      )}
      emptyIcon={<IconListDetails size={24} />}
      emptyMessage={tr(
        tr("項目がありません。「項目を追加」から作成してください。"),
      )}
      initial={[...initial].sort((a, b) => a.order - b.order)}
      newHref={`${BASE}/new`}
      persistAction={(next) =>
        updateProductItemDefs(next.map((d, i) => ({ ...d, order: i })))
      }
      setEnabled={(d, enabled) => ({ ...d, enabled })}
      toRow={(d) => ({
        id: d.key,
        editHref: `${BASE}/${encodeURIComponent(d.key)}`,
        enabled: d.enabled,
        title: (
          <Group gap="xs" wrap="wrap">
            <Text fw={600} size="sm">
              {d.label.ja || d.key}
            </Text>
            <Badge color="gray" size="xs" variant="light">
              {typeLabel(d.type)}
            </Badge>
            {d.required && (
              <Badge color="red" size="xs" variant="outline">
                {tr("必須")}
              </Badge>
            )}
          </Group>
        ),
        subtitle: (
          <Text c="dimmed" ff="mono" size="xs">
            {d.key}
          </Text>
        ),
      })}
    />
  );
}
