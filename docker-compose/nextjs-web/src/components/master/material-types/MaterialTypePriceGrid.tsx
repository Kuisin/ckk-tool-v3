"use client";

/**
 * MaterialTypePriceGrid — 材種の既定単価マトリクス編集 (MS24 既定単価タブ).
 *
 * 行 = 直径、列 = 黒皮/研磨。セルは ¥/1000mm の単価。仕入実績が無いとき試算の
 * フォールバック材料単価に使う（material_type_prices）。空セルは「価格なし」。
 * 共通の EditableCellTable（スリムな行編集表）で描画する。
 */

import { Group, NumberInput, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  type MaterialTypePriceRow,
  saveMaterialTypePrices,
} from "@/app/(dashboard)/master/material-types/actions";
import { SaveButton } from "@/components/ui/buttons";
import { EditableCellTable } from "@/components/ui/EditableCellTable";
import type { Option } from "@/lib/mock";

/** 保存済み価格（材種の全 material_type_prices 行）. */
export interface MaterialTypePriceSeed {
  diameterCode: string;
  surfaceFinishCode: string;
  unitPrice: number;
}

interface GridRow {
  diameterCode: string;
  /** surfaceFinishCode → 単価（"" = 価格なし）. */
  prices: Record<string, number | "">;
}

export function MaterialTypePriceGrid({
  materialTypeId,
  diameterOptions,
  surfaceOptions,
  initialPrices,
}: {
  materialTypeId: number;
  /** 直径 options（value = 3桁コード, label = φ表示）. */
  diameterOptions: Option[];
  /** 黒皮/研磨 options（value = 1文字コード, label = 名称）. */
  surfaceOptions: Option[];
  initialPrices: MaterialTypePriceSeed[];
}) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();

  const [rows, setRows] = useState<GridRow[]>(() => {
    const byDiameter = new Map<string, GridRow>();
    for (const p of initialPrices) {
      let row = byDiameter.get(p.diameterCode);
      if (!row) {
        row = { diameterCode: p.diameterCode, prices: {} };
        byDiameter.set(p.diameterCode, row);
      }
      row.prices[p.surfaceFinishCode] = p.unitPrice;
    }
    // 直径コード昇順で安定表示。
    return [...byDiameter.values()].sort((a, b) =>
      a.diameterCode.localeCompare(b.diameterCode),
    );
  });

  const setDiameter = (rowIndex: number, code: string) =>
    setRows((rs) =>
      rs.map((r, i) => (i === rowIndex ? { ...r, diameterCode: code } : r)),
    );
  const setPrice = (rowIndex: number, surf: string, v: number | "") =>
    setRows((rs) =>
      rs.map((r, i) =>
        i === rowIndex ? { ...r, prices: { ...r.prices, [surf]: v } } : r,
      ),
    );

  const addRow = () =>
    setRows((rs) => [...rs, { diameterCode: "", prices: {} }]);
  const removeRow = (rowIndex: number) =>
    setRows((rs) => rs.filter((_, i) => i !== rowIndex));

  const save = () => {
    // 直径が選択され、価格が入っているセルのみ行にする。
    const out: MaterialTypePriceRow[] = [];
    for (const r of rows) {
      if (!r.diameterCode) continue;
      for (const s of surfaceOptions) {
        const v = r.prices[s.value];
        if (typeof v === "number" && v >= 0 && r.prices[s.value] !== "") {
          out.push({
            diameterCode: r.diameterCode,
            surfaceFinishCode: s.value,
            unitPrice: v,
          });
        }
      }
    }
    startSaving(async () => {
      const res = await saveMaterialTypePrices(materialTypeId, out);
      if (res.ok) {
        notifications.show({
          title: "保存しました",
          message: `既定単価 ${out.length} 件を保存しました`,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: res.error,
          color: "red",
        });
      }
    });
  };

  const columns = [
    { header: "直径", minWidth: 140 },
    ...surfaceOptions.map((s) => ({ header: s.label, minWidth: 130 })),
  ];

  return (
    <Stack gap="sm">
      <Text c="dimmed" size="xs">
        材種 × 直径 × 黒皮/研磨
        ごとの既定材料単価（¥/1000mm）。仕入実績が無いとき
        試算のフォールバック単価に使います。空欄は「価格なし」。
      </Text>
      <EditableCellTable<GridRow>
        addLabel="直径を追加"
        columns={columns}
        minTableWidth={420}
        onAddRow={addRow}
        onRemoveRow={removeRow}
        removeLabel="行を削除"
        renderCell={(row, rowIndex, colIndex) => {
          if (colIndex === 0) {
            return (
              <Select
                data={diameterOptions}
                onChange={(v) => setDiameter(rowIndex, v ?? "")}
                placeholder="直径"
                searchable
                size="xs"
                value={row.diameterCode || null}
              />
            );
          }
          const surf = surfaceOptions[colIndex - 1];
          return (
            <NumberInput
              hideControls
              min={0}
              onChange={(v) =>
                setPrice(rowIndex, surf.value, typeof v === "number" ? v : "")
              }
              placeholder="—"
              prefix="¥"
              size="xs"
              thousandSeparator=","
              value={row.prices[surf.value] ?? ""}
            />
          );
        }}
        rows={rows}
      />
      <Group justify="flex-end">
        <SaveButton loading={isSaving} onClick={save}>
          既定単価を保存
        </SaveButton>
      </Group>
    </Stack>
  );
}
