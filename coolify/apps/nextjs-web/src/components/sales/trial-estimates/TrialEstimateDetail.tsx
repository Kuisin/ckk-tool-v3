"use client";

/**
 * TrialEstimateDetail — 価格試算 詳細 (SA52). Read-only view of a saved 価格試算:
 * summary + recomputed results + the material price-history graph.
 *
 * 手続き状況（ProcedurePanel — 下書き→確定→価格表登録済、価格表 →）。
 *
 * Flow (価格試算 → 価格表 → 見積書): DRAFT は「確定」で CONFIRMED になり、
 * 価格表（顧客×製品）の作成時に基準単価ソースとして選択できる（初回使用時に
 * REGISTERED でロック）。Backed by sales.estimates via the server page;
 * status transitions persist through Server Actions.
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
  IconCylinder,
  IconInfoCircle,
  IconLink,
  IconMessage2,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { searchProductOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  confirmTrialEstimate,
  linkTrialEstimateProduct,
} from "@/app/(dashboard)/sales/trial-estimates/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { AppTabs } from "@/components/ui/AppTabs";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { PRODUCT_F4 } from "@/components/ui/f4-presets";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModalShell } from "@/components/ui/modals";
import {
  type HandoffGroup,
  ProcedurePanel,
  type ProcedureStage,
} from "@/components/ui/ProcedurePanel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import type { MemoView } from "@/lib/document-memos";
import type { MaterialPricePoint } from "@/lib/material-pricing-core";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import {
  calcTrialPricing,
  TOOL_TYPE_OPTIONS,
  type TrialPricingOptions,
} from "@/lib/trial-pricing";
import { MaterialPriceChart } from "./MaterialPriceChart";
import type { LinkedPriceEntry, TrialEstimateRecord } from "./types";

const BASE_PATH = "/sales/trial-estimates";

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
  auditEntries,
  memos,
  priceHistory,
  pricingOptions = {},
  toolTypeOptions = TOOL_TYPE_OPTIONS,
}: {
  record: TrialEstimateRecord;
  linkedEntries: LinkedPriceEntry[];
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 社内コメント（document_memos 由来、コメントタブ）。 */
  memos: MemoView[];
  /** この素材の仕入実績（サーバー取得、価格推移タブ）。 */
  priceHistory: MaterialPricePoint[];
  /** 価格試算エンジンのオプション（係数・カスタム計算）。 */
  pricingOptions?: TrialPricingOptions;
  /** 工具種の選択肢（管理者定義。未指定は組み込み 3 種）. */
  toolTypeOptions?: { value: string; label: string }[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const toolLabel = (v: string) =>
    toolTypeOptions.find((o) => o.value === v)?.label ?? v;
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("result");
  // 保存/確定時に記録した価格（その時点の価格）を優先表示。無ければ現在の
  // 計算ロジックで再計算する（スナップショット導入前の古い価格試算向けフォールバック）。
  const result =
    record.resultSnapshot ?? calcTrialPricing(record.input, pricingOptions);
  const history = priceHistory;
  const [isPending, startTransition] = useTransition();
  const status = record.status;
  // 製品リンク モーダル（REGISTERED は価格表が参照済みのため変更不可）
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkProductId, setLinkProductId] = useState<string | null>(null);

  // ── 手続き状況（下書き → 確定 → 価格表登録済）───────────────────────────
  const stages: ProcedureStage[] = [
    {
      key: "draft",
      label: tr("common.draft"),
      description: fmt.date(record.createdAt),
      loading: status === "DRAFT",
    },
    {
      key: "confirmed",
      label: tr("common.confirmed"),
      description:
        status === "DRAFT"
          ? "価格表の基準単価にできる状態へ"
          : tr("sales.trialEstimates.confirmed"),
      loading: status === "CONFIRMED",
    },
    {
      key: "registered",
      label: tr("sales.trialEstimates.registered"),
      description: record.registeredAt
        ? fmt.date(record.registeredAt)
        : tr("sales.trialEstimates.confirmedOnceUsedInAPrice"),
    },
  ];
  const active = status === "DRAFT" ? 0 : status === "CONFIRMED" ? 1 : 3;

  // 下流 = この価格試算を基準単価ソースにした価格表（1 価格試算が複数に使われ得る）。
  const handoffGroups: HandoffGroup[] = [
    {
      key: "price-lists",
      title: tr("common.priceList"),
      summary: linkedEntries.length > 0 ? `${linkedEntries.length} 件` : null,
      items: linkedEntries.map((e) => ({
        key: e.entryId,
        label: `${e.customerName} × ${e.productName}`,
        href: `/sales/price-lists/${e.entryId}`,
        done: true,
        note: `${ORDER_TYPE_LABEL[e.orderType] ?? e.orderType}・${e.tierCount}段階`,
      })),
      emptyNote:
        status === "CONFIRMED"
          ? tr("sales.trialEstimates.unusedSelectableAsABasePrice")
          : tr("sales.trialEstimates.unusedOnceConfirmedItCanBe"),
    },
  ];

  const openProductLink = () => {
    setLinkProductId(record.productId);
    setLinkOpen(true);
  };

  const saveProductLink = () => {
    startTransition(async () => {
      const res = await linkTrialEstimateProduct(
        record.estimateNumber,
        linkProductId,
      );
      if (res.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: linkProductId
            ? tr("sales.trialEstimates.linkedToTheProductOnceConfirmed")
            : tr("sales.trialEstimates.theProductLinkWasRemoved"),
          color: "green",
        });
        setLinkOpen(false);
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error,
          color: "red",
        });
      }
    });
  };

  const confirm = () => {
    startTransition(async () => {
      const res = await confirmTrialEstimate(record.estimateNumber);
      if (res.ok) {
        notifications.show({
          title: tr("common.confirmed2"),
          message: tr("sales.trialEstimates.itCanBeChosenAsThe"),
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
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
                    label: tr("common.confirmed"),
                    icon: <IconCheck size={14} />,
                    onClick: confirm,
                  },
                ]
              : []),
            ...(status !== "REGISTERED"
              ? [
                  {
                    label: record.productId
                      ? tr("sales.trialEstimates.changeTheProductLink")
                      : tr("sales.trialEstimates.linkToAProduct"),
                    icon: <IconCylinder size={14} />,
                    onClick: openProductLink,
                  },
                ]
              : []),
            {
              label: tr("common.duplicateAndReEstimate"),
              icon: <IconCopy size={14} />,
              onClick: () => router.push(`${BASE_PATH}/new?from=${record.id}`),
            },
          ]}
        />
      }
      breadcrumbs={[
        tr("common.sales"),
        { label: tr("common.priceEstimate"), href: BASE_PATH },
        "詳細",
      ]}
      createdAt={fmt.dateTime(record.createdAt)}
      status={
        <Group gap="xs">
          <StatusBadge entity="Estimate" status={status} />
          <Badge color="gray" variant="light">
            {toolLabel(record.input.toolType)}
          </Badge>
          {record.isCustomPrice && (
            <Badge color="orange" variant="light">
              {tr("common.custom")}
            </Badge>
          )}
        </Group>
      }
      title={record.name}
      updatedAt={fmt.dateTime(record.updatedAt)}
    >
      {status === "REGISTERED" && (
        <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
          {tr("sales.trialEstimates.thisEstimateIsAlreadyUsedIn")}
        </Alert>
      )}
      {status === "CONFIRMED" && (
        <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
          {tr("sales.trialEstimates.confirmedThisEstimateCanBeChosen")}
        </Alert>
      )}
      <SummaryGrid>
        <FieldValue
          label={tr("common.priceEstimateNumber")}
          value={<DocNumber>{record.estimateNumber}</DocNumber>}
        />
        <FieldValue
          label={tr("sales.trialEstimates.quoteRecipient")}
          value={record.customerName ?? "—"}
        />
        <FieldValue label={tr("common.salesRep")} value={record.salesRepName} />
        <FieldValue label={tr("common.createdBy")} value={record.createdBy} />
        <FieldValue label="製品" value={record.productName ?? "—"} />
        <FieldValue
          label={tr("common.toolType")}
          value={toolLabel(record.input.toolType)}
        />
        <FieldValue
          label={tr("common.materials")}
          value={record.materialLabel}
        />
        <FieldValue
          label={tr("sales.trialEstimates.maxDiameter")}
          value={`${record.input.maxDiameter} mm`}
        />
        <FieldValue
          label={tr("common.overallLength")}
          value={`${record.input.totalLength} mm`}
        />
        <FieldValue
          label={tr("common.referenceUnitPrice1000mm")}
          value={
            record.input.toolType === "CYLINDER" ? (
              tr("sales.trialEstimates.cylinderEnteredByHand")
            ) : (
              <MoneyText value={record.input.materialBarPrice} />
            )
          }
        />
      </SummaryGrid>

      <ProcedurePanel
        active={active}
        handoffGroups={handoffGroups}
        stages={stages}
      />

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab leftSection={<IconCalculator size={14} />} value="result">
            {tr("common.priceEstimateResult")}
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconChartLine size={14} />} value="history">
            {tr("common.materialPriceHistory")}
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconLink size={14} />} value="related">
            {tr("common.related")}
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconMessage2 size={14} />} value="comments">
            {tr("common.comment")}
          </Tabs.Tab>
          <Tabs.Tab value="audit">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="result">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("common.baseUnitPriceQuantityScalingIs")}
              </Text>
              <Table>
                <Table.Tbody>
                  {result.lots[0] && (
                    <>
                      <Table.Tr>
                        <Table.Td>{tr("common.baseQuantity")}</Table.Td>
                        <Table.Td ta="right">
                          {result.lots[0].quantity}本
                        </Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td>{tr("common.minimumUnitPrice")}</Table.Td>
                        <Table.Td ta="right">
                          <MoneyText
                            value={Math.round(result.lots[0].minimumPrice)}
                          />
                        </Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td>
                          <Text fw={600} size="sm">
                            {tr("common.estimatedUnitPriceBase")}
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
                {tr("common.costBreakdownPerPiece")}
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
                {tr("common.priceList")}
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
                  {tr("sales.trialEstimates.unusedThisEstimateCanBeChosen")}
                </Text>
              )}
            </div>
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("common.quote")}
              </Text>
              <Text c="dimmed" size="sm">
                {tr("sales.trialEstimates.youCanCreateItFromThe")}
              </Text>
            </div>
          </Stack>
        </Tabs.Panel>

        {/* keepMounted={false}: エディタ（prosemirror）はタブを開くまで読み込まない。 */}
        <Tabs.Panel keepMounted={false} pt="md" value="comments">
          <MemoPanel
            memos={memos}
            mode="comment"
            ownerId={record.estimateNumber}
            ownerType="estimates"
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="audit">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <ModalShell
        confirmLabel={tr("common.save2")}
        loading={isPending}
        onClose={() => setLinkOpen(false)}
        onConfirm={saveProductLink}
        opened={linkOpen}
        title={
          record.productId
            ? "製品リンクを変更"
            : tr("sales.trialEstimates.linkToAProduct")
        }
      >
        <Stack gap="sm">
          <Text c="dimmed" size="sm">
            {tr("sales.trialEstimates.targetProductOptionalALinkedEstimate")}
          </Text>
          <SearchSelect
            clearable
            f4={PRODUCT_F4}
            initialOption={
              record.productId && record.productName
                ? { value: record.productId, label: record.productName }
                : null
            }
            label="製品"
            onChange={setLinkProductId}
            onSearch={searchProductOptions}
            placeholder={tr("common.searchProducts")}
            storageKey="product"
            value={linkProductId}
          />
        </Stack>
      </ModalShell>
    </DetailShell>
  );
}
