"use client";

/**
 * TrialEstimateDetail — 試算 詳細 (SA52). Read-only view of a saved 試算:
 * summary + recomputed results + the material price-history graph.
 *
 * Flow (試算 → 価格表 → 見積書): DRAFT は「確定」で CONFIRMED になり、
 * 「価格表に登録」で数量区分ごとの価格表になる（REGISTERED でロック）。
 */

import {
  Alert,
  Anchor,
  Badge,
  Group,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCalculator,
  IconChartLine,
  IconCheck,
  IconCopy,
  IconCurrencyYen,
  IconInfoCircle,
  IconLink,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { formatDateTime } from "@/lib/format";
import { getPriceHistory } from "@/lib/material-pricing";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import { calcTrialPricing, TOOL_TYPE_OPTIONS } from "@/lib/trial-pricing";
import { MOCK_PRICE_ENTRIES } from "../price-lists/mock";
import { ConvertToPriceListModal } from "./ConvertToPriceListModal";
import { MaterialPriceChart } from "./MaterialPriceChart";
import {
  type EstimateStatus,
  getTrialEstimate,
  MOCK_TRIAL_ESTIMATES,
} from "./mock";

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

// TODO(server): fetch audit_logs for this 試算.
const MOCK_AUDIT: AuditEntry[] = [
  {
    id: 1,
    action: "UPDATE",
    user: "鈴木",
    at: "2026/05/29 09:40",
    detail: "ステータス: 確定 → 価格表登録済",
  },
  {
    id: 2,
    action: "CREATE",
    user: "鈴木",
    at: "2026/05/28 10:15",
    detail: "試算を作成",
  },
];

export function TrialEstimateDetail({ id }: { id: string }) {
  const router = useRouter();
  const record = getTrialEstimate(id) ?? MOCK_TRIAL_ESTIMATES[0];
  const result = calcTrialPricing(record.input);
  const history = getPriceHistory(record.materialId);
  const [convertOpen, setConvertOpen] = useState(false);
  // TODO(server-action): status transitions persist server-side.
  const [status, setStatus] = useState<EstimateStatus>(record.status);

  // この試算から登録された価格表（REGISTERED のとき）。
  const linkedEntries = MOCK_PRICE_ENTRIES.filter(
    (e) => e.estimateId === record.id,
  );

  const confirm = () => {
    setStatus("CONFIRMED");
    notifications.show({
      title: "確定しました",
      message: "「価格表に登録」で数量区分ごとの価格表を作成できます",
      color: "green",
    });
  };

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            ...(status === "DRAFT"
              ? [
                  {
                    label: "確定",
                    icon: <IconCheck size={14} />,
                    onClick: confirm,
                  },
                ]
              : []),
            ...(status === "CONFIRMED"
              ? [
                  {
                    label: "価格表に登録",
                    icon: <IconCurrencyYen size={14} />,
                    onClick: () => setConvertOpen(true),
                  },
                ]
              : []),
            {
              label: "複製して再試算",
              icon: <IconCopy size={14} />,
              onClick: () => router.push(`${BASE_PATH}/new`),
            },
          ]}
        />
      }
      breadcrumbs={["販売", { label: "試算", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(record.createdAt)}
      status={
        <Group gap="xs">
          <StatusBadge entity="Estimate" status={status} />
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
      {status === "REGISTERED" && (
        <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
          この試算は価格表登録済のため編集できません。単価を見直す場合は複製して再試算してください。
        </Alert>
      )}
      <SummaryGrid>
        <FieldValue
          label="試算番号"
          value={<DocNumber>{record.estimateNumber}</DocNumber>}
        />
        <FieldValue label="見積り先" value={record.customerName ?? "—"} />
        <FieldValue label="工具種" value={toolLabel(record.input.toolType)} />
        <FieldValue label="素材" value={record.materialLabel} />
        <FieldValue label="最大径" value={`${record.input.maxDiameter} mm`} />
        <FieldValue label="全長" value={`${record.input.totalLength} mm`} />
        <FieldValue
          label="参照単価（¥/1000mm）"
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
          <Tabs.Tab leftSection={<IconLink size={14} />} value="related">
            関連
          </Tabs.Tab>
          <Tabs.Tab value="audit">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="result">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                基準単価（数量スケールは価格表の倍率で設定）
              </Text>
              <Table>
                <Table.Tbody>
                  {result.lots[0] && (
                    <>
                      <Table.Tr>
                        <Table.Td>基準数量</Table.Td>
                        <Table.Td ta="right">
                          {result.lots[0].quantity}本
                        </Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td>最低単価</Table.Td>
                        <Table.Td ta="right">
                          <MoneyText
                            value={Math.round(result.lots[0].minimumPrice)}
                          />
                        </Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td>
                          <Text fw={600} size="sm">
                            見積単価（基準）
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text fw={700} size="sm">
                            <MoneyText
                              value={result.lots[0].estimateUnitPrice}
                            />
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    </>
                  )}
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

        <Tabs.Panel pt="md" value="related">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                価格表
              </Text>
              {linkedEntries.length > 0 ? (
                <Stack gap={4}>
                  {linkedEntries.map((e) => (
                    <Anchor
                      key={e.entryId}
                      onClick={() =>
                        router.push(`/sales/price-lists/${e.entryId}`)
                      }
                      size="sm"
                    >
                      {e.customerName} × {e.productName}（
                      {ORDER_TYPE_LABEL[e.orderType]}・{e.tiers.length}段階）
                    </Anchor>
                  ))}
                </Stack>
              ) : (
                <Text c="dimmed" size="sm">
                  未登録 — 「価格表に登録」で数量区分ごとの価格表行を作成します
                </Text>
              )}
            </div>
            <div>
              <Text c="dimmed" mb={4} size="xs">
                見積書
              </Text>
              <Text c="dimmed" size="sm">
                —（価格表登録後に価格表から作成できます）
              </Text>
            </div>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="audit">
          <AuditTimeline entries={MOCK_AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <ConvertToPriceListModal
        estimate={record}
        onClose={() => setConvertOpen(false)}
        onRegistered={() => setStatus("REGISTERED")}
        opened={convertOpen}
      />
    </DetailShell>
  );
}
