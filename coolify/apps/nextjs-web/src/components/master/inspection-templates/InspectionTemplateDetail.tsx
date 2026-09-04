"use client";

/**
 * InspectionTemplateDetail.tsx — 検査表テンプレート 詳細 (MS29, design.md §8.2 / §13.4).
 *
 * サマリ（コード・バージョン・名称・関連工程・状態）+ タブ: テンプレート情報 /
 * 検査項目 / バージョン / 履歴。検査項目はサブテーブルでインライン追加・編集・
 * 削除する（個別ページなし）。指示書割当済み・検査記録ありのバージョンは
 * ロック — 項目編集は「新バージョンを作成」してから行う。
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Group,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCircleMinus,
  IconEdit,
  IconGitBranch,
  IconListCheck,
  IconLock,
  IconPlus,
  IconTrash,
  IconUsersGroup,
  IconVersions,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setTemplateItemRequired } from "@/app/(dashboard)/master/inspection-templates/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { AppTabs } from "@/components/ui/AppTabs";
import { GhostButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import {
  inspectionDepartmentLabel,
  inspectionItemTypeLabel,
  inspectionLayoutStyleLabel,
} from "@/lib/enum-labels";
import {
  acceptLabel,
  type BoolLabels,
  goalLabel,
  type InspectionItemSpec,
} from "@/lib/inspection-core";
import { samplingLabel } from "@/lib/inspection-labels";
import type { ApproverOption } from "./ApprovalTargetField";
import { InspectionTemplateImagePanel } from "./InspectionTemplateImagePanel";
import {
  CreateVersionModal,
  DeleteInspectionTemplateItemModal,
  DeleteInspectionTemplateModal,
  InspectionTemplateItemModal,
  type InspectionTemplateItemRow,
  SetApproversModal,
  ToggleInspectionTemplateActiveModal,
} from "./InspectionTemplateModals";

const BASE_PATH = "/master/inspection-templates";

export interface InspectionTemplateVersionRow {
  id: number;
  version: number;
  isActive: boolean;
  inUse: boolean; // 指示書割当 or 検査記録あり
  itemCount: number;
  updatedAt: string;
}

export interface InspectionTemplateDetailData {
  id: number;
  code: string;
  version: number;
  nameJa: string;
  nameEn: string;
  relatedProcessStep: string; // 未設定は ""
  /** 対象製品。未設定（汎用）は "" */
  productName: string;
  /** ナビゲーション用グループ。未設定は "" */
  groupName: string;
  /** 参考画像のファイル名。未設定は null（PDF にも印刷される）。 */
  imageFilename: string | null;
  /** 検査対象・記録方式（シート単位）。 */
  samplingMode: "ALL" | "PERCENT" | "COUNT";
  samplingValue: number | null;
  recordStyle: "VALUES" | "COUNTS";
  layoutStyle: "DIMENSIONAL" | "CHECKLIST";
  sampleNaming: "GENERIC" | "INITIAL_MID_FINAL";
  /** 検査承認グループ（承認設定 MS0B）。null = 未設定 = 誰でも検収できる。 */
  approvalGroupId: string | null;
  approvalGroupName: string | null;
  /** カスタム承認者（この検査表だけの承認者）。グループと同時には設定されない。 */
  approvers: ApproverOption[];
  isActive: boolean;
  /** 指示書割当 or 検査記録あり → 定義変更不可。 */
  isLocked: boolean;
  isLatestVersion: boolean;
  items: InspectionTemplateItemRow[];
  /** 同一 code の全バージョン（新しい順）。 */
  versions: InspectionTemplateVersionRow[];
  createdAt: string;
  updatedAt: string;
}

/** 行 → inspection-core の判定・表示に使う spec。 */
export function itemRowSpec(
  item: InspectionTemplateItemRow,
): InspectionItemSpec {
  return {
    id: item.id,
    inputType: item.inputType,
    unit: item.unit || null,
    toleranceMin: item.toleranceMin,
    toleranceMax: item.toleranceMax,
    options: item.options.map((o) => ({
      value: o.value,
      label: { ja: o.labelJa, en: o.labelEn },
    })),
    acceptBool: item.acceptBool,
    acceptOptions: item.acceptOptions.length > 0 ? item.acceptOptions : null,
    goalValue:
      item.inputType === "NUMBER"
        ? item.goalNumber
        : item.inputType === "BOOLEAN"
          ? item.goalBool
          : item.inputType === "SELECT_SINGLE"
            ? (item.goalOptions[0] ?? null)
            : item.goalOptions.length > 0
              ? item.goalOptions
              : null,
    allowManualOverride: item.allowManualOverride,
    isRequired: item.isRequired,
  };
}

export function InspectionTemplateDetail({
  record,
  auditEntries,
  groupOptions,
}: {
  record: InspectionTemplateDetailData;
  auditEntries: AuditEntry[];
  /** 検査承認グループの選択肢（承認設定 MS0B の approval_groups）。 */
  groupOptions: { value: string; label: string }[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const bool: BoolLabels = {
    yes: tr("common.yes"),
    no: tr("common.no"),
    rangeBetween: (min, max) =>
      tr("inspectionLabels.rangeBetween", { min, max }),
    rangeAtLeast: (min) => tr("inspectionLabels.rangeAtLeast", { min }),
    rangeAtMost: (max) => tr("inspectionLabels.rangeAtMost", { max }),
    listSeparator: tr("inspectionLabels.listSeparator"),
  };
  const fmt = useFormat();
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("info");

  // 行から必須 / 任意を切り替えている最中の項目（その行だけ止める）。
  const [requiredBusyId, setRequiredBusyId] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [approvalGroupOpen, setApprovalGroupOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [, startRequiredTransition] = useTransition();

  /** 行の 必須 / 任意 を切り替える（失敗したら通知して元の表示へ戻す）。 */
  const toggleRequired = (id: number, name: string, next: boolean) => {
    setRequiredBusyId(id);
    startRequiredTransition(async () => {
      const result = await setTemplateItemRequired(id, next);
      setRequiredBusyId(null);
      if (result.ok) {
        notifications.show({
          title: next
            ? tr("master.inspectionTemplates.markedRequired")
            : tr("master.inspectionTemplates.markedOptional"),
          message: name,
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
  const [editItem, setEditItem] = useState<InspectionTemplateItemRow | null>(
    null,
  );
  const [deleteItem, setDeleteItem] =
    useState<InspectionTemplateItemRow | null>(null);

  const target = {
    id: record.id,
    code: record.code,
    version: record.version,
    name: record.nameJa,
    isActive: record.isActive,
  };

  // 追加時の表示順初期値: 既存の最大 + 10
  const nextSortOrder =
    record.items.length > 0
      ? Math.max(...record.items.map((i) => i.sortOrder)) + 10
      : 10;

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            {
              label: tr("common.createANewVersion"),
              icon: <IconVersions size={14} />,
              onClick: () => setVersionOpen(true),
            },
            {
              label: tr(
                "master.inspectionTemplates.changeTheInspectionApprovalRecipient",
              ),
              icon: <IconUsersGroup size={14} />,
              onClick: () => setApprovalGroupOpen(true),
            },
            {
              label: record.isActive ? "無効化" : tr("common.enable"),
              icon: <IconCircleMinus size={14} />,
              onClick: () => setToggleOpen(true),
            },
            {
              label: tr("common.delete"),
              icon: <IconTrash size={14} />,
              color: "red",
              divider: true,
              onClick: () => setDeleteOpen(true),
            },
          ]}
          onEdit={
            record.isLocked
              ? undefined
              : () => router.push(`${BASE_PATH}/${record.id}/edit`)
          }
          pdf={{
            href: `/api/pdf/inspection-sheet?templateId=${record.id}`,
            label: tr("master.inspectionTemplates.blankSheet"),
          }}
        />
      }
      breadcrumbs={[
        tr("common.masterData"),
        { label: tr("common.inspectionTemplates"), href: BASE_PATH },
        `${record.code} v${record.version}`,
      ]}
      createdAt={fmt.dateTime(record.createdAt)}
      status={
        <Group gap="xs" wrap="nowrap">
          <Badge color="gray" variant="outline">
            v{record.version}
          </Badge>
          <ActiveBadge active={record.isActive} />
        </Group>
      }
      title={record.nameJa}
      updatedAt={fmt.dateTime(record.updatedAt)}
    >
      {record.isLocked && (
        <Alert color="blue" icon={<IconLock size={16} />}>
          {tr("master.inspectionTemplates.thisVersionCannotBeChangedWhile")}
        </Alert>
      )}

      <SummaryGrid>
        <FieldValue
          label={tr("master.inspectionTemplateDetail.code")}
          value={<DocNumber>{record.code}</DocNumber>}
        />
        <FieldValue
          label={tr("common.version")}
          value={`v${record.version}${record.isLatestVersion ? "（最新）" : ""}`}
        />
        <FieldValue label={tr("common.name2")} value={record.nameJa} />
        <FieldValue
          label={tr("common.relatedStep")}
          value={record.relatedProcessStep || "—"}
        />
        <FieldValue
          label={tr("common.targetProduct")}
          value={record.productName || tr("common.generic")}
        />
        {record.groupName && (
          <FieldValue
            label={tr("common.group")}
            value={
              <Badge color="gray" variant="light">
                {record.groupName}
              </Badge>
            }
          />
        )}
        <FieldValue
          label={tr("master.inspectionTemplates.inspectionTarget")}
          value={samplingLabel(tr, {
            samplingMode: record.samplingMode,
            samplingValue: record.samplingValue,
          })}
        />
        <FieldValue
          label={tr("common.recordingMode")}
          value={
            record.recordStyle === "COUNTS"
              ? tr("common.passCountOnly")
              : tr("common.measuredValuePerProduct")
          }
        />
        <FieldValue
          label={tr("common.printLayout")}
          value={inspectionLayoutStyleLabel(record.layoutStyle, locale)}
        />
        {record.recordStyle === "VALUES" && (
          <FieldValue
            label={tr("common.sampleName")}
            value={
              record.sampleNaming === "INITIAL_MID_FINAL"
                ? tr("master.inspectionTemplates.initialInterimFinal")
                : tr("master.inspectionTemplates.product123")
            }
          />
        )}
        <FieldValue
          label={tr("common.inspectionApprovalRecipient")}
          value={
            record.approvalGroupName ??
            (record.approvers.length > 0
              ? record.approvers.map((a) => a.label).join("、")
              : tr("master.inspectionTemplates.notSetAnyoneCanAccept"))
          }
        />
        <FieldValue
          label={tr("master.inspectionTemplates.inspectionItems")}
          value={tr("master.inspectionTemplateTable.itemCountWithUnit", {
            count: record.items.length,
          })}
        />
        <FieldValue
          label={tr("common.status")}
          value={<ActiveBadge active={record.isActive} />}
        />
      </SummaryGrid>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="info">
            {tr("master.inspectionTemplates.templateInformation")}
          </Tabs.Tab>
          <Tabs.Tab value="items">
            {tr("master.inspectionTemplates.inspectionItem")}
          </Tabs.Tab>
          <Tabs.Tab value="versions">{tr("common.version")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="info">
          <Stack gap="md">
            <Stack gap="sm">
              <FieldValue
                label={tr("common.nameJapanese")}
                value={record.nameJa}
              />
              <FieldValue
                label={tr("common.nameEnglish")}
                value={record.nameEn || "—"}
              />
              <FieldValue
                label={tr("common.relatedStep")}
                value={record.relatedProcessStep || "—"}
              />
              <FieldValue
                label={tr("common.targetProduct")}
                value={record.productName || tr("common.generic")}
              />
            </Stack>
            <InspectionTemplateImagePanel
              filename={record.imageFilename}
              templateId={record.id}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="items">
          <Stack gap="sm">
            <Group justify="flex-end">
              {record.isLocked ? (
                <GhostButton
                  leftSection={<IconVersions size={14} />}
                  onClick={() => setVersionOpen(true)}
                >
                  {tr("master.inspectionTemplates.createANewVersionAndEdit")}
                </GhostButton>
              ) : (
                <GhostButton
                  leftSection={<IconPlus size={14} />}
                  onClick={() => {
                    setEditItem(null);
                    setItemModalOpen(true);
                  }}
                >
                  {tr("common.addAnItem")}
                </GhostButton>
              )}
            </Group>
            {record.items.length === 0 ? (
              <EmptyState
                icon={<IconListCheck size={24} />}
                message={tr(
                  "master.inspectionTemplates.thereAreNoInspectionItems",
                )}
              />
            ) : (
              <ScrollArea>
                <Table striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{tr("common.itemName")}</Table.Th>
                      <Table.Th w={110}>{tr("common.type2")}</Table.Th>
                      <Table.Th w={170}>
                        {tr("master.inspectionTemplates.passCriteria")}
                      </Table.Th>
                      <Table.Th w={130}>
                        {tr("master.inspectionTemplates.target")}
                      </Table.Th>
                      <Table.Th w={70}>{tr("common.required2")}</Table.Th>
                      <Table.Th w={70}>{tr("common.sortOrder")}</Table.Th>
                      {!record.isLocked && <Table.Th w={80} />}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {record.items.map((item) => {
                      const spec = itemRowSpec(item);
                      return (
                        <Table.Tr key={item.id}>
                          <Table.Td>
                            <Text fw={500} size="sm">
                              {item.itemNameJa}
                            </Text>
                            {item.itemNameEn &&
                              item.itemNameEn !== item.itemNameJa && (
                                <Text c="dimmed" size="xs">
                                  {item.itemNameEn}
                                </Text>
                              )}
                          </Table.Td>
                          <Table.Td>
                            <Group gap={4} wrap="wrap">
                              <Badge color="gray" variant="light">
                                {inspectionItemTypeLabel(
                                  item.inputType,
                                  locale,
                                ) ?? item.inputType}
                              </Badge>
                              {!item.allowManualOverride && (
                                <Badge color="orange" size="xs" variant="light">
                                  {tr(
                                    "master.inspectionTemplates.cannotBeOverwritten",
                                  )}
                                </Badge>
                              )}
                              {item.section === "SHAPE" && (
                                <Badge color="teal" size="xs" variant="light">
                                  {tr(
                                    "master.inspectionTemplates.shapeSection",
                                  )}
                                </Badge>
                              )}
                              {item.department && (
                                <Badge color="violet" size="xs" variant="light">
                                  {inspectionDepartmentLabel(
                                    item.department,
                                    locale,
                                  )}
                                </Badge>
                              )}
                              {item.measurementEquipment && (
                                <Badge
                                  color="gray"
                                  ff="mono"
                                  size="xs"
                                  variant="outline"
                                >
                                  {item.measurementEquipment}
                                </Badge>
                              )}
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Text className="tabular-nums" size="sm">
                              {acceptLabel(spec, locale, bool) ?? "—"}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text className="tabular-nums" size="sm">
                              {goalLabel(spec, locale, bool) ?? "—"}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            {/* 行から直接切り替える — 必須かどうかを見直すのに
                                項目の編集モーダルを開かせない。使用済み
                                （バージョンロック）の検査表では表示だけ。 */}
                            {record.isLocked ? (
                              <Badge
                                color={item.isRequired ? "blue" : "gray"}
                                variant="light"
                              >
                                {item.isRequired
                                  ? tr("common.required2")
                                  : tr("common.optional")}
                              </Badge>
                            ) : (
                              <Switch
                                aria-label={tr(
                                  "master.inspectionTemplates.toggleRequiredFor",
                                  { name: item.itemNameJa },
                                )}
                                checked={item.isRequired}
                                disabled={requiredBusyId === item.id}
                                label={
                                  item.isRequired
                                    ? tr("common.required2")
                                    : tr("common.optional")
                                }
                                onChange={(e) =>
                                  toggleRequired(
                                    item.id,
                                    item.itemNameJa,
                                    e.currentTarget.checked,
                                  )
                                }
                                size="sm"
                              />
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Text className="tabular-nums" size="sm">
                              {item.sortOrder}
                            </Text>
                          </Table.Td>
                          {!record.isLocked && (
                            <Table.Td>
                              <Group gap={4} justify="flex-end" wrap="nowrap">
                                <Tooltip
                                  label={tr("common.edit2")}
                                  withinPortal
                                >
                                  <ActionIcon
                                    aria-label={tr(
                                      "master.inspectionTemplates.editTheInspectionItem",
                                    )}
                                    color="gray"
                                    onClick={() => {
                                      setEditItem(item);
                                      setItemModalOpen(true);
                                    }}
                                    variant="subtle"
                                  >
                                    <IconEdit size={14} />
                                  </ActionIcon>
                                </Tooltip>
                                <Tooltip
                                  label={tr("common.delete")}
                                  withinPortal
                                >
                                  <ActionIcon
                                    aria-label={tr(
                                      "master.inspectionTemplates.deleteTheInspectionItem",
                                    )}
                                    color="red"
                                    onClick={() => setDeleteItem(item)}
                                    variant="subtle"
                                  >
                                    <IconTrash size={14} />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>
                            </Table.Td>
                          )}
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="versions">
          {record.versions.length === 0 ? (
            <EmptyState
              icon={<IconGitBranch size={24} />}
              message={tr("master.inspectionTemplates.thereAreNoOtherVersions")}
            />
          ) : (
            <ScrollArea>
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={110}>{tr("common.version")}</Table.Th>
                    <Table.Th w={90}>{tr("common.items")}</Table.Th>
                    <Table.Th w={110}>
                      {tr("master.inspectionTemplates.usage")}
                    </Table.Th>
                    <Table.Th w={90}>{tr("common.status")}</Table.Th>
                    <Table.Th>{tr("common.updatedAt")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {record.versions.map((v) => (
                    <Table.Tr key={v.id}>
                      <Table.Td>
                        {v.id === record.id ? (
                          <Group gap={6} wrap="nowrap">
                            <Text fw={600} size="sm">
                              v{v.version}
                            </Text>
                            <Text c="dimmed" size="xs">
                              {tr("master.inspectionTemplates.showing")}
                            </Text>
                          </Group>
                        ) : (
                          <Text
                            component={Link}
                            fw={600}
                            href={`${BASE_PATH}/${v.id}`}
                            size="sm"
                            td="underline"
                          >
                            v{v.version}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text className="tabular-nums" size="sm">
                          {v.itemCount}件
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {v.inUse ? (
                          <Badge color="blue" variant="light">
                            {tr("master.inspectionTemplates.inUse")}
                          </Badge>
                        ) : (
                          <Badge color="gray" variant="light">
                            {tr("master.inspectionTemplates.unused")}
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <ActiveBadge active={v.isActive} />
                      </Table.Td>
                      <Table.Td>
                        <Text c="dimmed" size="sm">
                          {fmt.dateTime(v.updatedAt)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <DeleteInspectionTemplateModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleInspectionTemplateActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
      <CreateVersionModal
        onClose={() => setVersionOpen(false)}
        onCreated={(newId) => router.push(`${BASE_PATH}/${newId}`)}
        opened={versionOpen}
        target={target}
      />
      <SetApproversModal
        currentApprovers={record.approvers}
        currentGroupId={record.approvalGroupId}
        groupOptions={groupOptions}
        onClose={() => setApprovalGroupOpen(false)}
        onDone={() => router.refresh()}
        opened={approvalGroupOpen}
        target={target}
      />
      <InspectionTemplateItemModal
        defaultSortOrder={nextSortOrder}
        item={editItem}
        layoutStyle={record.layoutStyle}
        onClose={() => setItemModalOpen(false)}
        onDone={() => router.refresh()}
        opened={itemModalOpen}
        templateId={record.id}
      />
      <DeleteInspectionTemplateItemModal
        item={deleteItem}
        onClose={() => setDeleteItem(null)}
        onDone={() => router.refresh()}
        opened={!!deleteItem}
      />
    </DetailShell>
  );
}
