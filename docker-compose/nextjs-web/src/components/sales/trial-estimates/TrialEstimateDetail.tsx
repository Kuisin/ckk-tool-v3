"use client";

/**
 * TrialEstimateDetail — 試算 詳細 (SA52). Read-only view of a saved 試算:
 * summary + recomputed results + the material price-history graph.
 */

import { Badge, Group, Paper, Stack, Table, Tabs, Text } from "@mantine/core";
import {
  IconCalculator,
  IconChartLine,
  IconCurrencyYen,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FieldValue } from "@/components/ui/FieldValue";
import { MoneyText } from "@/components/ui/MoneyText";
import {
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { formatDateTime } from "@/lib/format";
import { getPriceHistory } from "@/lib/material-pricing";
import { calcTrialPricing, TOOL_TYPE_OPTIONS } from "@/lib/trial-pricing";
import { ConvertToPriceListModal } from "./ConvertToPriceListModal";
import { MaterialPriceChart } from "./MaterialPriceChart";
import { getTrialEstimate, MOCK_TRIAL_ESTIMATES } from "./mock";

const BASE_PATH = "/sales/trial-estimates";
const toolLabel = (v: string) =>
  TOOL_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;

const BREAKDOWN_ROWS = [
  ["材料原価", "material"],
  ["段加工費", "step"],
  ["首下加工費", "neck"],
  ["加工単価", "machining"],
  ["コート代", "coating"],
  ["ラップ処理", "lap"],
  ["LD", "ld"],
  ["検査成績書", "inspection"],
] as const;

export function TrialEstimateDetail({ id }: { id: string }) {
  const router = useRouter();
  const record = getTrialEstimate(id) ?? MOCK_TRIAL_ESTIMATES[0];
  const result = calcTrialPricing(record.input);
  const history = getPriceHistory(record.materialId);
  const [convertOpen, setConvertOpen] = useState(false);

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            {
              label: "価格表へ変換",
              icon: <IconCurrencyYen size={14} />,
              onClick: () => setConvertOpen(true),
            },
            {
              label: "複製して新規",
              onClick: () => router.push(`${BASE_PATH}/new`),
            },
          ]}
        />
      }
      breadcrumbs={["販売", { label: "試算", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(record.createdAt)}
      status={
        <Group gap="xs">
          <Badge color="gray" variant="light">
            {toolLabel(record.input.toolType)}
          </Badge>
          {record.isCustomPrice && (
            <Badge color="orange" variant="light">
              カスタム
            </Badge>
          )}
        </Group>
      }
      title={record.name}
      updatedAt={formatDateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue label="見積り先" value={record.customerName ?? "—"} />
        <FieldValue label="工具種" value={toolLabel(record.input.toolType)} />
        <FieldValue label="素材" value={record.materialLabel} />
        <FieldValue label="最大径" value={`${record.input.maxDiameter} mm`} />
        <FieldValue label="全長" value={`${record.input.totalLength} mm`} />
        <FieldValue
          label="参照単価（¥/100mm）"
          value={
            record.input.toolType === "CYLINDER" ? (
              "—（円筒：手入力）"
            ) : (
              <MoneyText value={record.input.materialBarPrice} />
            )
          }
        />
      </SummaryGrid>

      <Tabs defaultValue="result">
        <Tabs.List>
          <Tabs.Tab leftSection={<IconCalculator size={14} />} value="result">
            試算結果
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconChartLine size={14} />} value="history">
            素材価格推移
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="result">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                ロット別 見積単価
              </Text>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ロット</Table.Th>
                    <Table.Th ta="right">最低単価</Table.Th>
                    <Table.Th ta="right">掛け率</Table.Th>
                    <Table.Th ta="right">見積単価</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {result.lots.map((l) => (
                    <Table.Tr key={l.quantity}>
                      <Table.Td>{l.quantity}本</Table.Td>
                      <Table.Td ta="right">
                        <MoneyText value={Math.round(l.minimumPrice)} />
                      </Table.Td>
                      <Table.Td ta="right">×{l.discountRate}</Table.Td>
                      <Table.Td ta="right">
                        <Text fw={700} size="sm">
                          <MoneyText value={l.estimateUnitPrice} />
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
            <div>
              <Text c="dimmed" mb={4} size="xs">
                原価内訳（1本あたり）
              </Text>
              <Table>
                <Table.Tbody>
                  {BREAKDOWN_ROWS.map(([label, key]) => (
                    <Table.Tr key={key}>
                      <Table.Td>{label}</Table.Td>
                      <Table.Td ta="right">
                        <MoneyText value={Math.round(result.breakdown[key])} />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <Paper p="md" radius="md" withBorder>
            <MaterialPriceChart
              points={history}
              selectedDate={record.referenceDate}
            />
          </Paper>
        </Tabs.Panel>
      </Tabs>

      <ConvertToPriceListModal
        estimate={record}
        onClose={() => setConvertOpen(false)}
        opened={convertOpen}
      />
    </DetailShell>
  );
}
