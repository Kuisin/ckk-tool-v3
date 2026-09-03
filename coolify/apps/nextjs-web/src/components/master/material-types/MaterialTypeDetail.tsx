"use client";

/**
 * MaterialTypeDetail.tsx — 材種 詳細 (MS25, design.md §8.2).
 *
 * Ported from design-preview (designs/master/material-types/detail.tsx) and
 * backed by server data. 関連タブはこの材種に紐づく素材の一覧。
 * 履歴タブは audit_logs 導入後に接続する（現状は空表示）。
 */

import { Badge, Group, Stack, Table, Tabs, Text } from "@mantine/core";
import { IconCircleMinus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { AppTabs } from "@/components/ui/AppTabs";
import { DocNumber } from "@/components/ui/DocNumber";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import type { Option } from "@/lib/mock";
import {
  DeleteMaterialTypeModal,
  ToggleMaterialTypeActiveModal,
} from "./MaterialTypeModals";
import {
  MaterialTypePriceGrid,
  type MaterialTypePriceSeed,
  MaterialTypePriceView,
} from "./MaterialTypePriceGrid";

const BASE_PATH = "/master/material-types";

export interface MaterialTypeDetailData {
  id: number;
  /** 材種コード（未変換は null）。 */
  code: string | null;
  /** 変換済（コード構成あり）のときのみ。null = レガシー未変換。 */
  composition: {
    manufacturerLabel: string;
    gradeLabel: string;
    shapeLabel: string;
    kindCode: string;
  } | null;
  nameJa: string;
  nameEn: string;
  descriptionJa: string;
  descriptionEn: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  materials: {
    id: number;
    code: string;
    name: string;
    size: string;
    unit: string;
    isActive: boolean;
  }[];
}

export function MaterialTypeDetail({
  record,
  auditEntries,
  diameterOptions,
  surfaceOptions,
  prices,
}: {
  record: MaterialTypeDetailData;
  auditEntries: AuditEntry[];
  /** 既定単価タブ用: 直径・黒皮/研磨 の選択肢 + 保存済み価格. */
  diameterOptions: Option[];
  surfaceOptions: Option[];
  prices: MaterialTypePriceSeed[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const target = {
    id: record.id,
    name: record.nameJa,
    isActive: record.isActive,
  };

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            {
              label: record.isActive
                ? tr("common.disable")
                : tr("common.enable"),
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
          onEdit={() => router.push(`${BASE_PATH}/${record.id}/edit`)}
        />
      }
      breadcrumbs={[
        tr("common.masterData"),
        { label: tr("common.materialTypes"), href: BASE_PATH },
        record.code ?? record.nameJa,
      ]}
      createdAt={fmt.dateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={fmt.dateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("common.materialTypeCode")}
          value={
            record.code ? (
              <DocNumber>{record.code}</DocNumber>
            ) : (
              <Group gap={6} wrap="nowrap">
                <Badge color="gray" size="xs" variant="light">
                  {tr("master.materialTypes.notConvertedLegacy")}
                </Badge>
              </Group>
            )
          }
        />
        <FieldValue label={tr("common.nameJapanese")} value={record.nameJa} />
        <FieldValue
          label={tr("common.nameEnglish")}
          value={record.nameEn || "—"}
        />
        {record.composition && (
          <>
            <FieldValue
              label={tr("common.manufacturer")}
              value={record.composition.manufacturerLabel}
            />
            <FieldValue
              label={tr("master.materialTypes.manufacturerGrade")}
              value={record.composition.gradeLabel}
            />
            <FieldValue
              label={tr("common.shape")}
              value={record.composition.shapeLabel}
            />
            <FieldValue
              label={tr("common.kindNumberedAutomatically")}
              value={<DocNumber>{record.composition.kindCode}</DocNumber>}
            />
          </>
        )}
      </SummaryGrid>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="prices">
            {tr("master.materialTypes.defaultUnitPrice")}
          </Tabs.Tab>
          <Tabs.Tab value="related">{tr("common.related")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <FieldValue
              label={tr("common.descriptionJapanese")}
              value={record.descriptionJa || "—"}
            />
            <FieldValue
              label={tr("master.materialTypes.descriptionEnglish")}
              value={record.descriptionEn || "—"}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="prices">
          <EditablePanel
            canEdit
            edit={({ close }) => (
              <MaterialTypePriceGrid
                diameterOptions={diameterOptions}
                initialPrices={prices}
                materialTypeId={record.id}
                onCancel={close}
                onSaved={close}
                surfaceOptions={surfaceOptions}
              />
            )}
            view={
              <MaterialTypePriceView
                diameterOptions={diameterOptions}
                prices={prices}
                surfaceOptions={surfaceOptions}
              />
            }
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              {tr("master.materialTypes.materialsOfThisType")}
            </Text>
            {record.materials.length === 0 ? (
              <Text c="dimmed" size="sm">
                {tr("master.materialTypes.thereAreNoMaterialsOfThis")}
              </Text>
            ) : (
              <Table highlightOnHover striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{tr("common.materialCode")}</Table.Th>
                    <Table.Th>{tr("common.name2")}</Table.Th>
                    {!isMobile && (
                      <Table.Th>
                        {tr("master.materialTypes.dimensions")}
                      </Table.Th>
                    )}
                    {!isMobile && <Table.Th>{tr("common.unit")}</Table.Th>}
                    <Table.Th>{tr("common.status")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {record.materials.map((r) => (
                    <Table.Tr
                      className="cursor-pointer"
                      key={r.id}
                      onClick={() => router.push(`/master/materials/${r.id}`)}
                    >
                      <Table.Td>
                        <DocNumber c="blue">{r.code}</DocNumber>
                      </Table.Td>
                      <Table.Td>{r.name}</Table.Td>
                      {!isMobile && <Table.Td>{r.size}</Table.Td>}
                      {!isMobile && <Table.Td>{r.unit}</Table.Td>}
                      <Table.Td>
                        <ActiveBadge active={r.isActive} />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <DeleteMaterialTypeModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleMaterialTypeActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
