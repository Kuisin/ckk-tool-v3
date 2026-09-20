"use client";

/**
 * StockTakeDetail — 棚卸 詳細 (PD28, design.md §8.2)。
 *
 * ActionCard（承認依頼 / 承認・差し戻し / 承認依頼中 / 差し戻し —
 * components/approvals/ApprovalActionCard を共用。承認設定 (MS0B) に段が
 * 無ければ「提出」を押した瞬間にそのまま確定する）+ SummaryGrid +
 * 手続き状況（下書き → 記入 → 承認 → 確定）+ 対象バケットの記入グリッド
 * （canEditCounts の間だけ編集可）+ Tabs（履歴）。
 *
 * 編集専用の画面は無い — 記入はこの詳細画面がそのまま担う
 * （数量管理・提出・承認までの一連が 1 画面に収まる）。
 */

import {
  Anchor,
  Badge,
  Group,
  NumberInput,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  approveStockTake,
  cancelStockTake,
  rejectStockTake,
  saveStockTakeCounts,
  submitStockTake,
} from "@/app/(dashboard)/inventory/stock-takes/actions";
import {
  ApprovalActionCard,
  type ApprovalActionState,
} from "@/components/approvals/ApprovalActionCard";
import {
  ApprovalTrailList,
  type ApprovalTrailView,
  countTrailRecords,
} from "@/components/approvals/ApprovalTrailList";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { AppTabs } from "@/components/ui/AppTabs";
import { SaveButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { ConfirmModal } from "@/components/ui/modals";
import {
  approvalStage,
  type HandoffGroup,
  ProcedurePanel,
  procedureStages,
} from "@/components/ui/ProcedurePanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { categoryLabel } from "@/lib/app-list";
import type { Locale } from "@/lib/i18n";
import type { ActionResult } from "@/lib/server-action";
import {
  canCancel,
  canEditCounts,
  canSubmit,
  countedLines,
  differenceCount,
  differenceTotals,
  lineInputsOf,
  type StockTakeLineView,
  type StockTakeView,
  stockTakeDifference,
} from "./model";

const BASE_PATH = "/inventory/stock-takes";

/** status/approvalStatus → いま留まっている段の index（下書き→記入→承認→確定）。 */
function currentStage(v: StockTakeView): number {
  if (v.status === "CONFIRMED") return 4;
  if (v.status === "CANCELLED") return v.requestedAt ? 2 : 1;
  if (v.approvalStatus === "PENDING") return 2;
  return 1;
}

type CountDraft = { countedQuantity: number | null; notes: string };

function draftOf(lines: StockTakeLineView[]): Record<string, CountDraft> {
  return Object.fromEntries(
    lines.map((l) => [
      l.id,
      { countedQuantity: l.countedQuantity, notes: l.notes ?? "" },
    ]),
  );
}

/** 差異の表示（未カウント / 0 / ±差異）。コンポーネントではなく素の関数 — 行ごとの再マウントを避ける。 */
function renderDifference(
  line: StockTakeLineView,
  counted: number | null,
  tr: ReturnType<typeof useTranslations>,
) {
  if (counted == null) {
    return (
      <Text c="dimmed" size="xs">
        {tr("production.stockTakes.detail.notCounted")}
      </Text>
    );
  }
  const d = stockTakeDifference({
    bookQuantity: line.bookQuantity,
    countedQuantity: counted,
  });
  if (d === 0)
    return (
      <Text c="dimmed" size="xs">
        0
      </Text>
    );
  return (
    <Text
      c={d > 0 ? "blue" : "orange"}
      className="tabular-nums"
      fw={600}
      size="xs"
    >
      {d > 0 ? `+${d}` : d}
    </Text>
  );
}

/** 対象バケットの記入グリッド — canEditCounts の間だけ入力できる。 */
function StockTakeLinesPanel({
  stockTakeNumber,
  lines,
  editable,
}: {
  stockTakeNumber: string;
  lines: StockTakeLineView[];
  editable: boolean;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Record<string, CountDraft>>(() =>
    draftOf(lines),
  );

  useEffect(() => {
    setDraft(draftOf(lines));
  }, [lines]);

  const setCounted = (id: string, value: number | string) => {
    const num = value === "" ? null : Number(value);
    setDraft((cur) => ({
      ...cur,
      [id]: {
        ...cur[id],
        countedQuantity: num != null && Number.isFinite(num) ? num : null,
      },
    }));
  };
  const setNotes = (id: string, value: string) => {
    setDraft((cur) => ({ ...cur, [id]: { ...cur[id], notes: value } }));
  };

  const inputs = lines.map((l) => ({
    bookQuantity: l.bookQuantity,
    countedQuantity: draft[l.id]?.countedQuantity ?? null,
  }));
  const counted = countedLines(inputs);
  const diffCount = differenceCount(inputs);
  const totals = differenceTotals(inputs);

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveStockTakeCounts(
        stockTakeNumber,
        lines.map((l) => ({
          id: l.id,
          countedQuantity: draft[l.id]?.countedQuantity ?? null,
          notes: (draft[l.id]?.notes ?? "").trim() || null,
        })),
      );
      if (result.ok) {
        notifications.show({
          title: tr("common.saved"),
          message: tr("production.stockTakes.detail.countsSaved"),
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const typeLabel = (t: StockTakeLineView["inventoryType"]) =>
    tr(t === "PRODUCT" ? "common.product" : "common.materials");

  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Title order={5}>
          {tr("production.stockTakes.detail.linesTitle", {
            count: lines.length,
          })}
        </Title>
        <Text c="dimmed" size="xs">
          {tr("production.stockTakes.detail.summaryLine", {
            counted,
            total: lines.length,
            diffCount,
            over: totals.over,
            under: totals.under,
          })}
        </Text>
      </Group>

      {isMobile ? (
        <Stack gap="sm">
          {lines.map((line) => (
            <Paper key={line.id} p="sm" radius="sm" withBorder>
              <Stack gap={6}>
                <Group justify="space-between" wrap="nowrap">
                  <Stack className="min-w-0" gap={2}>
                    <Text fw={600} size="sm" truncate>
                      {line.itemName}
                    </Text>
                    <Text c="dimmed" ff="mono" size="xs">
                      {line.itemCode ?? "—"}
                    </Text>
                  </Stack>
                  <Badge className="shrink-0" size="xs" variant="light">
                    {typeLabel(line.inventoryType)}
                  </Badge>
                </Group>
                <Text c="dimmed" size="xs">
                  {line.storageLabel ??
                    tr("production.stockTakes.detail.unassignedLocation")}
                  {line.lotNumber != null ? ` / #${line.lotNumber}` : ""}
                </Text>
                <Group gap="md">
                  <Text size="xs">
                    {tr("production.stockTakes.detail.bookQuantity")}:{" "}
                    {line.bookQuantity}
                  </Text>
                  {renderDifference(
                    line,
                    draft[line.id]?.countedQuantity ?? null,
                    tr,
                  )}
                </Group>
                <NumberInput
                  decimalScale={3}
                  disabled={!editable}
                  label={tr("production.stockTakes.detail.countedQuantity")}
                  min={0}
                  onChange={(v) => setCounted(line.id, v)}
                  placeholder={tr("production.stockTakes.detail.notCounted")}
                  size="lg"
                  value={draft[line.id]?.countedQuantity ?? ""}
                />
                {editable && (
                  <TextInput
                    label={tr("common.notes")}
                    onChange={(e) => setNotes(line.id, e.currentTarget.value)}
                    size="lg"
                    value={draft[line.id]?.notes ?? ""}
                  />
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Table.ScrollContainer minWidth={760}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{tr("common.type2")}</Table.Th>
                <Table.Th>{tr("production.stockTakes.detail.item")}</Table.Th>
                <Table.Th>
                  {tr("production.stockTakes.table.storageLocation")}
                </Table.Th>
                <Table.Th>{tr("common.lot")}</Table.Th>
                <Table.Th ta="right">
                  {tr("production.stockTakes.detail.bookQuantity")}
                </Table.Th>
                <Table.Th ta="right">
                  {tr("production.stockTakes.detail.countedQuantity")}
                </Table.Th>
                <Table.Th ta="right">
                  {tr("production.stockTakes.detail.difference")}
                </Table.Th>
                <Table.Th>{tr("common.notes")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lines.map((line) => (
                <Table.Tr key={line.id}>
                  <Table.Td>
                    <Badge size="xs" variant="light">
                      {typeLabel(line.inventoryType)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{line.itemName}</Text>
                    <Text c="dimmed" ff="mono" size="xs">
                      {line.itemCode ?? "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {line.storageLabel ??
                      tr("production.stockTakes.detail.unassignedLocation")}
                  </Table.Td>
                  <Table.Td>
                    {line.lotNumber != null ? (
                      <DocNumber>{line.lotNumber}</DocNumber>
                    ) : (
                      "—"
                    )}
                  </Table.Td>
                  <Table.Td className="tabular-nums" ta="right">
                    {line.bookQuantity}
                  </Table.Td>
                  <Table.Td ta="right">
                    {editable ? (
                      <NumberInput
                        decimalScale={3}
                        hideControls
                        min={0}
                        onChange={(v) => setCounted(line.id, v)}
                        size="xs"
                        value={draft[line.id]?.countedQuantity ?? ""}
                        w={110}
                      />
                    ) : (
                      <Text className="tabular-nums" size="sm">
                        {draft[line.id]?.countedQuantity ?? "—"}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    {renderDifference(
                      line,
                      draft[line.id]?.countedQuantity ?? null,
                      tr,
                    )}
                  </Table.Td>
                  <Table.Td>
                    {editable ? (
                      <TextInput
                        onChange={(e) =>
                          setNotes(line.id, e.currentTarget.value)
                        }
                        size="xs"
                        value={draft[line.id]?.notes ?? ""}
                      />
                    ) : (
                      <Text c="dimmed" size="xs">
                        {line.notes ?? "—"}
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {editable && (
        <Group justify="flex-end" mt="md">
          <SaveButton loading={isPending} onClick={handleSave} type="button">
            {tr("common.save")}
          </SaveButton>
        </Group>
      )}
    </Paper>
  );
}

export function StockTakeDetail({
  stockTake,
  auditEntries,
  approval,
  approvalTrail = [],
}: {
  stockTake: StockTakeView;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 承認フローの現在状態（承認 / 差し戻しのゲートと表示）。 */
  approval: ApprovalActionState;
  approvalTrail?: ApprovalTrailView[];
}) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;
  const fmt = useFormat();
  const router = useRouter();
  const [tab, setTab] = useTabParam("overview");
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);

  const v = stockTake;
  const state = { status: v.status, approvalStatus: v.approvalStatus };
  const editable = canEditCounts(state);
  const canRequestSubmit = canSubmit(state, lineInputsOf(v.lines));
  const cancellable = canCancel(state);

  const run = (action: () => Promise<ActionResult>, done: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: done,
          message: `${tr("common.stockTake")} ${v.stockTakeNumber}`,
          color: "green",
        });
        setCancelOpen(false);
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const stages = procedureStages(
    [
      {
        key: "draft",
        label: tr("production.stockTakes.detail.stageDraft"),
        description: fmt.dateTime(v.createdAt),
      },
      {
        key: "counting",
        label: tr("production.stockTakes.detail.stageCounting"),
        description: tr("production.stockTakes.detail.countedProgress", {
          counted: countedLines(lineInputsOf(v.lines)),
          total: v.lines.length,
        }),
      },
      approvalStage(approval, {
        approvedAt: v.status === "CONFIRMED" ? v.confirmedAt : null,
        fmtDate: (d) => fmt.date(d),
        label: tr("common.approve"),
        tr,
      }),
      {
        key: "confirmed",
        label: tr("production.stockTakes.detail.stageConfirmed"),
        description: v.confirmedAt ? fmt.dateTime(v.confirmedAt) : null,
      },
    ],
    currentStage(v),
    { stopped: v.status === "CANCELLED" },
  );

  const handoffGroups: HandoffGroup[] = [
    {
      key: "movement",
      title: tr("production.stockTakes.detail.movementTitle"),
      items: v.movementNumber
        ? [
            {
              key: v.movementNumber,
              label: v.movementNumber,
              href: `/inventory/movements/${v.movementNumber}`,
              done: true,
            },
          ]
        : [],
      emptyNote:
        v.status === "CONFIRMED"
          ? tr("production.stockTakes.detail.noDifferenceNoMovement")
          : tr("production.stockTakes.detail.notConfirmedYet"),
    },
  ];

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={
            cancellable
              ? [
                  {
                    label: tr("common.cancel"),
                    icon: <IconX size={14} />,
                    color: "red",
                    onClick: () => setCancelOpen(true),
                  },
                ]
              : []
          }
        />
      }
      breadcrumbs={[
        categoryLabel("在庫", locale), // i18n-ignore — app-list のカテゴリ名（対訳は app-list.ts が持つ）
        { label: tr("common.stockTake"), href: BASE_PATH },
        tr("common.detailBreadcrumb"),
      ]}
      createdAt={fmt.dateTime(v.createdAt)}
      status={<StatusBadge entity="StockTake" status={v.status} />}
      title={v.stockTakeNumber}
      updatedAt={fmt.dateTime(v.updatedAt)}
    >
      <ApprovalActionCard
        approval={approval}
        canRequest={canRequestSubmit}
        onApprove={() => approveStockTake(v.stockTakeNumber)}
        onReject={(reason) => rejectStockTake(v.stockTakeNumber, reason)}
        onRequest={() => submitStockTake(v.stockTakeNumber)}
        rejectReason={v.rejectReason}
        subject={`${tr("common.stockTake")} ${v.stockTakeNumber}`}
      />

      <SummaryGrid>
        <FieldValue
          label={tr("production.stockTakes.detail.numberLabel")}
          value={<DocNumber>{v.stockTakeNumber}</DocNumber>}
        />
        <FieldValue label={tr("common.site")} value={v.plantName} />
        <FieldValue
          label={tr("production.stockTakes.table.storageLocation")}
          value={v.storageLocationName ?? "—"}
        />
        <FieldValue
          label={tr("common.createdBy")}
          value={v.createdByName ?? "—"}
        />
        <FieldValue
          label={tr("production.stockTakes.detail.createdAtLabel")}
          value={fmt.dateTime(v.createdAt)}
        />
        <FieldValue
          label={tr("production.stockTakes.detail.confirmedAtLabel")}
          value={v.confirmedAt ? fmt.dateTime(v.confirmedAt) : "—"}
        />
        {v.movementNumber && (
          <FieldValue
            label={tr("production.stockTakes.detail.movementTitle")}
            value={
              <Anchor
                component={Link}
                href={`/inventory/movements/${v.movementNumber}`}
                size="sm"
              >
                <DocNumber c="blue">{v.movementNumber}</DocNumber>
              </Anchor>
            }
          />
        )}
      </SummaryGrid>

      <ProcedurePanel handoffGroups={handoffGroups} stages={stages}>
        {countTrailRecords(approvalTrail) > 0 && (
          <ApprovalTrailList trail={approvalTrail} />
        )}
      </ProcedurePanel>

      <StockTakeLinesPanel
        editable={editable}
        lines={v.lines}
        stockTakeNumber={v.stockTakeNumber}
      />

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <div>
            <Text c="dimmed" mb={4} size="xs">
              {tr("common.notes")}
            </Text>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {v.notes || "—"}
            </Text>
          </div>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <ConfirmModal
        confirmColor="red"
        confirmLabel={tr("common.cancelDocument")}
        loading={isPending}
        message={tr("production.stockTakes.detail.confirmCancelBody", {
          number: v.stockTakeNumber,
        })}
        onClose={() => setCancelOpen(false)}
        onConfirm={() =>
          run(() => cancelStockTake(v.stockTakeNumber), tr("common.cancelled"))
        }
        opened={cancelOpen}
        title={tr("common.confirmCancellation")}
      />
    </DetailShell>
  );
}
