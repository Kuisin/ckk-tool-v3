"use client";

/**
 * ItemDefsListPanel — 製品項目（SY03）の項目定義一覧。
 *
 * 一覧は SettingsReorderableList（有効切替・並び替え・削除・追加）。
 * 各項目の編集は行クリックで /settings/product-items/[key] へ。
 */

import { Badge, Group, Text } from "@mantine/core";
import { IconListDetails } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { updateProductItemDefs } from "@/app/(dashboard)/settings/actions";
import { SettingsReorderableList } from "@/components/settings/SettingsReorderableList";
import {
  type ProductItemDef,
  productFieldTypeLabel,
} from "@/lib/product-types";

const BASE = "/settings/product-items";

export function ItemDefsListPanel({ initial }: { initial: ProductItemDef[] }) {
  const tr = useTranslations();
  const typeLabel = (v: string) => productFieldTypeLabel(v, tr);
  return (
    <SettingsReorderableList
      addLabel={tr("common.addAnItem")}
      deleteConfirm={(d) => ({
        title: tr("settings.itemDefsListPanel.deleteTheItemDefinition"),
        message: tr(
          "settings.itemDefsListPanel.deleteNameConfirmUnassignsFromTypes",
          { name: d.label.ja || d.key },
        ),
      })}
      description={tr(
        "settings.itemDefsListPanel.aLibraryOfReusableInputFields",
      )}
      emptyIcon={<IconListDetails size={24} />}
      emptyMessage={tr("settings.itemDefsListPanel.thereAreNoItemsCreateOne")}
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
                {tr("common.required2")}
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
