"use client";

/**
 * ProductTypesListPanel — 製品種別（SY04）の一覧。
 *
 * 一覧は SettingsReorderableList（有効切替・並び替え・削除・追加）。
 * 各種別（項目の割り当て）の編集は行クリックで /settings/product-types/[id] へ。
 */

import { Badge, Group, Text } from "@mantine/core";
import { IconCategory } from "@tabler/icons-react";
import { updateProductTypes } from "@/app/(dashboard)/settings/actions";
import { SettingsReorderableList } from "@/components/settings/SettingsReorderableList";
import { useTr } from "@/hooks/useTr";
import type { ProductType } from "@/lib/product-types";

const BASE = "/settings/product-types";

export function ProductTypesListPanel({ initial }: { initial: ProductType[] }) {
  const tr = useTr();
  return (
    <SettingsReorderableList
      addLabel={tr("種別を追加")}
      deleteConfirm={(t) => ({
        title: tr("製品種別の削除"),
        message: `「${t.name.ja || t.id}」を削除しますか？`,
      })}
      description={tr(
        tr(
          tr(
            "新規製品作成時の選択肢になります。各種別に項目を割り当てて構成します。",
          ),
        ),
      )}
      emptyIcon={<IconCategory size={24} />}
      emptyMessage={tr(
        tr("種別がありません。「種別を追加」から作成してください。"),
      )}
      initial={[...initial].sort((a, b) => a.order - b.order)}
      newHref={`${BASE}/new`}
      persistAction={(next) =>
        updateProductTypes(next.map((t, i) => ({ ...t, order: i })))
      }
      setEnabled={(t, enabled) => ({ ...t, enabled })}
      toRow={(t) => ({
        id: t.id,
        editHref: `${BASE}/${encodeURIComponent(t.id)}`,
        enabled: t.enabled,
        title: (
          <Group gap="xs" wrap="wrap">
            <Text fw={600} size="sm">
              {t.name.ja || t.id}
            </Text>
            <Badge color="blue" size="xs" variant="light">
              項目 {t.assignments.length}
            </Badge>
          </Group>
        ),
        subtitle: t.description ? (
          <Text c="dimmed" lineClamp={1} size="xs">
            {t.description}
          </Text>
        ) : undefined,
      })}
    />
  );
}
