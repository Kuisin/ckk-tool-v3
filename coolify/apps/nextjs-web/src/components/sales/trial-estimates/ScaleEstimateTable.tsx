"use client";

/**
 * ScaleEstimateTable — 価格試算の見積単価（基準）に数量スケール（SY02）を当てた
 * 数量ごとの単価の見込み。単価 = 基準単価 × 倍率（円未満四捨五入）で、価格表が
 * この価格試算を基準単価にして作る数量段階と同じ計算になる。表示だけで保存しない
 * — 実際の数量ごとの価格は価格表が持つ。
 */

import { Table, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import { quantityRange } from "@/components/sales/price-lists/model";
import { MoneyText } from "@/components/ui/MoneyText";
import {
  type ScalePresetRow,
  scalePresetRanges,
  scalePresetUnitPrice,
} from "@/lib/price-scale-preset";

export function ScaleEstimateTable({
  baseUnitPrice,
  preset,
}: {
  /** 見積単価（基準）。 */
  baseUnitPrice: number;
  preset: readonly ScalePresetRow[];
}) {
  const tr = useTranslations();
  return (
    <div>
      <Text c="dimmed" fw={600} size="xs">
        {tr("sales.trialEstimates.scaleEstimateTitle")}
      </Text>
      <Text c="dimmed" mb={4} size="xs">
        {tr("sales.trialEstimates.scaleEstimateNote")}
      </Text>
      <Table c="dimmed">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{tr("settings.scalePreset.colRange")}</Table.Th>
            <Table.Th ta="right">
              {tr("settings.scalePreset.colMultiplier")}
            </Table.Th>
            <Table.Th ta="right">
              {tr("settings.scalePreset.colUnitPrice")}
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {scalePresetRanges(preset).map((r) => (
            <Table.Tr key={r.minQuantity}>
              <Table.Td>
                {quantityRange(r.minQuantity, r.maxQuantity, tr)}
              </Table.Td>
              <Table.Td className="tabular-nums" ff="mono" ta="right">
                ×{r.multiplier.toFixed(2)}
              </Table.Td>
              <Table.Td ta="right">
                <MoneyText
                  value={scalePresetUnitPrice(baseUnitPrice, r.multiplier)}
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}
