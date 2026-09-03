"use client";

/**
 * MaterialTypePriceGrid — 材種の既定単価マトリクス編集 (MS25 既定単価タブ).
 *
 * 行 = 直径、列 = 黒皮/研磨。セルは ¥/1000mm の単価。仕入実績が無いとき価格試算の
 * フォールバック材料単価に使う（material_type_prices）。空セルは「価格なし」。
 * 共通の EditableCellTable（スリムな行編集表）で描画する。
 */

import { NumberInput, Select, Stack, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  type MaterialTypePriceRow,
  saveMaterialTypePrices,
} from "@/app/(dashboard)/master/material-types/actions";
import { EditableCellTable } from "@/components/ui/EditableCellTable";
import { MoneyText } from "@/components/ui/MoneyText";
import { FormActions } from "@/components/ui/shells";
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
  onCancel,
  onSaved,
}: {
  materialTypeId: number;
  /** 直径 options（value = 3桁コード, label = φ表示）. */
  diameterOptions: Option[];
  /** 黒皮/研磨 options（value = 1文字コード, label = 名称）. */
  surfaceOptions: Option[];
  initialPrices: MaterialTypePriceSeed[];
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const tr = useTranslations();
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
          title: tr("common.saved2"),
          message: tr("master.materialTypePriceGrid.savedMessage", {
            count: out.length,
          }),
          color: "green",
        });
        router.refresh();
        onSaved?.();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error,
          color: "red",
        });
      }
    });
  };

  const columns = [
    { header: tr("common.diameter"), minWidth: 140 },
    ...surfaceOptions.map((s) => ({ header: s.label, minWidth: 130 })),
  ];

  return (
    <Stack gap="sm">
      <Text c="dimmed" size="xs">
        {tr("master.materialTypes.theDefaultMaterialPricePerMaterial")}
      </Text>
      <EditableCellTable<GridRow>
        addLabel={tr("master.materialTypes.addADiameter")}
        columns={columns}
        minTableWidth={420}
        onAddRow={addRow}
        onRemoveRow={removeRow}
        removeLabel={tr("common.removeRow")}
        renderCell={(row, rowIndex, colIndex) => {
          if (colIndex === 0) {
            return (
              <Select
                data={diameterOptions}
                onChange={(v) => setDiameter(rowIndex, v ?? "")}
                placeholder={tr("common.diameter")}
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
      <FormActions
        loading={isSaving}
        onCancel={onCancel}
        onSave={save}
        submitLabel={tr("master.materialTypes.saveTheDefaultUnitPrice")}
      />
    </Stack>
  );
}

/** 既定単価タブの閲覧モード（EditablePanel の view）。 */
export function MaterialTypePriceView({
  diameterOptions,
  surfaceOptions,
  prices,
}: {
  diameterOptions: Option[];
  surfaceOptions: Option[];
  prices: MaterialTypePriceSeed[];
}) {
  const tr = useTranslations();

  const byDiameter = new Map<string, Record<string, number>>();
  for (const p of prices) {
    let row = byDiameter.get(p.diameterCode);
    if (!row) {
      row = {};
      byDiameter.set(p.diameterCode, row);
    }
    row[p.surfaceFinishCode] = p.unitPrice;
  }
  const diameterLabel = (code: string) =>
    diameterOptions.find((o) => o.value === code)?.label ?? code;
  const rows = [...byDiameter.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <Stack gap="sm">
      <Text c="dimmed" size="xs">
        {tr("master.materialTypes.theDefaultMaterialPricePerMaterial")}
      </Text>
      {rows.length === 0 ? (
        <Text c="dimmed" size="sm">
          {tr("common.notSet")}
        </Text>
      ) : (
        <Table withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{tr("common.diameter")}</Table.Th>
              {surfaceOptions.map((s) => (
                <Table.Th key={s.value} style={{ textAlign: "right" }}>
                  {s.label}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(([diameterCode, prices]) => (
              <Table.Tr key={diameterCode}>
                <Table.Td>{diameterLabel(diameterCode)}</Table.Td>
                {surfaceOptions.map((s) => (
                  <Table.Td key={s.value}>
                    {s.value in prices ? (
                      <MoneyText value={prices[s.value]} />
                    ) : (
                      <Text c="dimmed" size="sm" ta="right">
                        —
                      </Text>
                    )}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
