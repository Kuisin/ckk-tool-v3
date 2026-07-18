"use client";

/**
 * TrialEstimateDetail — 試算 詳細 (SA52). Read-only view of a saved 試算:
 * summary + recomputed results + the material price-history graph.
 *
 * Flow (試算 → 価格表 → 見積書): DRAFT は「確定」で CONFIRMED になり、
 * 「価格表に登録」で数量区分ごとの価格表になる（REGISTERED でロック）。
 * Backed by sales.estimates via the server page; status transitions persist
 * through Server Actions.
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
import { useState, useTransition } from "react";
import { confirmTrialEstimate } from "@/app/(dashboard)/sales/trial-estimates/actions";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { formatDateTime } from "@/lib/format";
import type { MaterialPricePoint } from "@/lib/material-pricing-core";
import type { Option } from "@/lib/mock";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import {
  calcTrialPricing,
  TOOL_TYPE_OPTIONS,
  type TrialPricingOptions,
} from "@/lib/trial-pricing";
import { ConvertToPriceListModal } from "./ConvertToPriceListModal";
import { MaterialPriceChart } from "./MaterialPriceChart";
import type {
  ExistingEntryRef,
  LinkedPriceEntry,
  TrialEstimateRecord,
} from "./types";

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

export function TrialEstimateDetail({
  record,
  linkedEntries,
  customerOptions,
  productOptions,
  existingEntries,
  auditEntries,
  priceHistory,
  pricingOptions = {},
}: {
  record: TrialEstimateRecord;
  linkedEntries: LinkedPriceEntry[];
  customerOptions: Option[];
  productOptions: Option[];
  existingEntries: ExistingEntryRef[];
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** この素材の仕入実績（サーバー取得、価格推移タブ）。 */
  priceHistory: MaterialPricePoint[];
  /** 試算エンジンのオプション（係数・カスタム計算）。 */
  pricingOptions?: TrialPricingOptions;
}) {
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("result");
  // 保存/確定時に記録した価格（その時点の価格）を優先表示。無ければ現在の
  // 計算ロジックで再計算する（スナップショット導入前の古い試算向けフォールバック）。
  const result =
    record.resultSnapshot ?? calcTrialPricing(record.input, pricingOptions);
  const history = priceHistory;
  const [convertOpen, setConvertOpen] = useState(false);
  const [, startTransition] = useTransition();
  const status = record.status;

  const confirm = () => {
    startTransition(async () => {
      const res = await confirmTrialEstimate(record.estimateNumber);
      if (res.ok) {
        notifications.show({
          title: "確定しました",
          message: "「価格表に登録」で数量区分ごとの価格表を作成できます",
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
              onClick: () => router.push(`${BASE_PATH}/new?from=${record.id}`),
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

      <Tabs onChange={setTab} value={tab}>
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
                      {ORDER_TYPE_LABEL[e.orderType]}・{e.tierCount}段階）
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
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <ConvertToPriceListModal
        customerOptions={customerOptions}
        estimate={record}
        existingEntries={existingEntries}
        onClose={() => setConvertOpen(false)}
        onRegistered={() => router.refresh()}
        opened={convertOpen}
        pricingOptions={pricingOptions}
        productOptions={productOptions}
      />
    </DetailShell>
  );
}
