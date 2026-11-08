"use client";

/**
 * CostSummaryRows — 見積単価の下に置く「原価合計 / 粗利」の 2 行。
 *
 * 原価合計は計算基準の「原価」の印（SY02）を付けた基準の和で、結果
 * （TrialResult.costTotal）に焼き込まれている。印が入る前に保存した価格試算は
 * 値を持たないので、その場合は何も描かない（推測で埋めない）。
 */

import { Table, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import { MoneyText } from "@/components/ui/MoneyText";

export function CostSummaryRows({
  costTotal,
  estimateUnitPrice,
}: {
  costTotal: number | undefined;
  estimateUnitPrice: number;
}) {
  const tr = useTranslations();
  if (costTotal === undefined) return null;
  const margin = estimateUnitPrice - costTotal;
  const marginRate =
    estimateUnitPrice > 0 ? (margin / estimateUnitPrice) * 100 : null;
  return (
    <>
      <Table.Tr>
        <Table.Td>{tr("sales.trialEstimates.costTotal")}</Table.Td>
        <Table.Td ta="right">
          <MoneyText value={Math.round(costTotal)} />
        </Table.Td>
      </Table.Tr>
      <Table.Tr>
        <Table.Td>{tr("sales.trialEstimates.grossMargin")}</Table.Td>
        <Table.Td ta="right">
          <Text c={margin < 0 ? "red" : undefined} size="sm">
            <MoneyText value={Math.round(margin)} />
            {marginRate !== null && (
              <Text c="dimmed" component="span" ml={6} size="xs">
                {`(${marginRate.toFixed(1)}%)`}
              </Text>
            )}
          </Text>
        </Table.Td>
      </Table.Tr>
    </>
  );
}
