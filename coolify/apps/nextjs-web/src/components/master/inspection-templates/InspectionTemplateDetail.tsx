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
  Table,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
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
import { useLocale } from "next-intl";
import { useState } from "react";
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
import { useTr } from "@/hooks/useTr";
import { useTabParam } from "@/hooks/useUrlState";
import {
  inspectionDepartmentLabel,
  inspectionItemTypeLabel,
  inspectionLayoutStyleLabel,
} from "@/lib/enum-labels";
import {
  acceptLabel,
  goalLabel,
  type InspectionItemSpec,
  samplingLabelJa,
} from "@/lib/inspection-core";
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
  const tr = useTr();
  const locale = useLocale();
  const fmt = useFormat();
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("info");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [approvalGroupOpen, setApprovalGroupOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
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
              label: tr("新バージョンを作成"),
              icon: <IconVersions size={14} />,
              onClick: () => setVersionOpen(true),
            },
            {
              label: tr("検査承認の宛先を変更"),
              icon: <IconUsersGroup size={14} />,
              onClick: () => setApprovalGroupOpen(true),
            },
            {
              label: record.isActive ? "無効化" : tr("有効化"),
              icon: <IconCircleMinus size={14} />,
              onClick: () => setToggleOpen(true),
            },
            {
              label: "削除",
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
            label: tr("空欄シート"),
          }}
        />
      }
      breadcrumbs={[
        tr("マスタ"),
        { label: tr("検査表テンプレート"), href: BASE_PATH },
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
          {tr(
            tr(
              "このバージョンは指示書または検査記録で使用中のため変更できません。\n          内容を変更するには「新バージョンを作成」してください（既存の記録は\n          このバージョンのまま残ります）。",
            ),
          )}
        </Alert>
      )}

      <SummaryGrid>
        <FieldValue
          label="コード"
          value={<DocNumber>{record.code}</DocNumber>}
        />
        <FieldValue
          label={tr("バージョン")}
          value={`v${record.version}${record.isLatestVersion ? "（最新）" : ""}`}
        />
        <FieldValue label={tr("名称")} value={record.nameJa} />
        <FieldValue
          label={tr("関連工程")}
          value={record.relatedProcessStep || "—"}
        />
        <FieldValue
          label={tr("対象製品")}
          value={record.productName || tr("汎用")}
        />
        {record.groupName && (
          <FieldValue
            label={tr("グループ")}
            value={
              <Badge color="gray" variant="light">
                {record.groupName}
              </Badge>
            }
          />
        )}
        <FieldValue
          label={tr("検査対象")}
          value={samplingLabelJa({
            samplingMode: record.samplingMode,
            samplingValue: record.samplingValue,
          })}
        />
        <FieldValue
          label={tr("記録方式")}
          value={
            record.recordStyle === "COUNTS"
              ? tr("合格数のみ")
              : tr("実測値（製品ごと）")
          }
        />
        <FieldValue
          label={tr("印刷レイアウト")}
          value={inspectionLayoutStyleLabel(record.layoutStyle, locale)}
        />
        {record.recordStyle === "VALUES" && (
          <FieldValue
            label={tr("サンプル呼称")}
            value={
              record.sampleNaming === "INITIAL_MID_FINAL"
                ? tr("初品・中間品・最終品")
                : tr("製品1, 2, 3…")
            }
          />
        )}
        <FieldValue
          label={tr("検査承認の宛先")}
          value={
            record.approvalGroupName ??
            (record.approvers.length > 0
              ? record.approvers.map((a) => a.label).join("、")
              : tr("未設定（誰でも検収可）"))
          }
        />
        <FieldValue
          label={tr("検査項目数")}
          value={tr("{v0}件", { v0: record.items.length })}
        />
        <FieldValue
          label={tr("状態")}
          value={<ActiveBadge active={record.isActive} />}
        />
      </SummaryGrid>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="info">{tr("テンプレート情報")}</Tabs.Tab>
          <Tabs.Tab value="items">{tr("検査項目")}</Tabs.Tab>
          <Tabs.Tab value="versions">{tr("バージョン")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("履歴")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="info">
          <Stack gap="md">
            <Stack gap="sm">
              <FieldValue label={tr("名称（日本語）")} value={record.nameJa} />
              <FieldValue
                label={tr("名称（英語）")}
                value={record.nameEn || "—"}
              />
              <FieldValue
                label={tr("関連工程")}
                value={record.relatedProcessStep || "—"}
              />
              <FieldValue
                label={tr("対象製品")}
                value={record.productName || tr("汎用")}
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
                  {tr("新バージョンを作成して編集")}
                </GhostButton>
              ) : (
                <GhostButton
                  leftSection={<IconPlus size={14} />}
                  onClick={() => {
                    setEditItem(null);
                    setItemModalOpen(true);
                  }}
                >
                  {tr("項目を追加")}
                </GhostButton>
              )}
            </Group>
            {record.items.length === 0 ? (
              <EmptyState
                icon={<IconListCheck size={24} />}
                message={tr("検査項目がありません")}
              />
            ) : (
              <ScrollArea>
                <Table striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{tr("項目名")}</Table.Th>
                      <Table.Th w={110}>{tr("種別")}</Table.Th>
                      <Table.Th w={170}>{tr("合格基準")}</Table.Th>
                      <Table.Th w={130}>{tr("目標")}</Table.Th>
                      <Table.Th w={70}>{tr("必須")}</Table.Th>
                      <Table.Th w={70}>{tr("表示順")}</Table.Th>
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
                                  {tr("上書き不可")}
                                </Badge>
                              )}
                              {item.section === "SHAPE" && (
                                <Badge color="teal" size="xs" variant="light">
                                  {tr("形状欄")}
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
                              {acceptLabel(spec) ?? "—"}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text className="tabular-nums" size="sm">
                              {goalLabel(spec) ?? "—"}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            {item.isRequired ? (
                              <Badge color="blue" variant="light">
                                {tr("必須")}
                              </Badge>
                            ) : (
                              <Badge color="gray" variant="light">
                                {tr("任意")}
                              </Badge>
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
                                <Tooltip label={tr("編集")} withinPortal>
                                  <ActionIcon
                                    aria-label={tr("検査項目を編集")}
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
                                <Tooltip label="削除" withinPortal>
                                  <ActionIcon
                                    aria-label={tr("検査項目を削除")}
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
              message={tr("他のバージョンはありません")}
            />
          ) : (
            <ScrollArea>
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={110}>{tr("バージョン")}</Table.Th>
                    <Table.Th w={90}>{tr("項目数")}</Table.Th>
                    <Table.Th w={110}>{tr("使用状況")}</Table.Th>
                    <Table.Th w={90}>{tr("状態")}</Table.Th>
                    <Table.Th>{tr("更新日時")}</Table.Th>
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
                              {tr("（表示中）")}
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
                            {tr("使用中")}
                          </Badge>
                        ) : (
                          <Badge color="gray" variant="light">
                            {tr("未使用")}
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
