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
import { useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { AppTabs } from "@/components/ui/AppTabs";
import { DocNumber } from "@/components/ui/DocNumber";
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
import { useIsMobile } from "@/hooks/useViewport";
import type { Option } from "@/lib/mock";
import {
  DeleteMaterialTypeModal,
  ToggleMaterialTypeActiveModal,
} from "./MaterialTypeModals";
import {
  MaterialTypePriceGrid,
  type MaterialTypePriceSeed,
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
  const tr = useTr();
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
          onEdit={() => router.push(`${BASE_PATH}/${record.id}/edit`)}
        />
      }
      breadcrumbs={[
        tr("マスタ"),
        { label: tr("材種"), href: BASE_PATH },
        record.code ?? record.nameJa,
      ]}
      createdAt={fmt.dateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={fmt.dateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("材種コード")}
          value={
            record.code ? (
              <DocNumber>{record.code}</DocNumber>
            ) : (
              <Group gap={6} wrap="nowrap">
                <Badge color="gray" size="xs" variant="light">
                  {tr("未変換（レガシー）")}
                </Badge>
              </Group>
            )
          }
        />
        <FieldValue label={tr("名称（日本語）")} value={record.nameJa} />
        <FieldValue label={tr("名称（英語）")} value={record.nameEn || "—"} />
        {record.composition && (
          <>
            <FieldValue
              label={tr("メーカー")}
              value={record.composition.manufacturerLabel}
            />
            <FieldValue
              label={tr("メーカー材種")}
              value={record.composition.gradeLabel}
            />
            <FieldValue
              label={tr("形状")}
              value={record.composition.shapeLabel}
            />
            <FieldValue
              label={tr("種類（自動採番）")}
              value={<DocNumber>{record.composition.kindCode}</DocNumber>}
            />
          </>
        )}
      </SummaryGrid>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("概要")}</Tabs.Tab>
          <Tabs.Tab value="prices">{tr("既定単価")}</Tabs.Tab>
          <Tabs.Tab value="related">{tr("関連")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("履歴")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <FieldValue
              label={tr("説明（日本語）")}
              value={record.descriptionJa || "—"}
            />
            <FieldValue
              label={tr("説明（英語）")}
              value={record.descriptionEn || "—"}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="prices">
          <MaterialTypePriceGrid
            diameterOptions={diameterOptions}
            initialPrices={prices}
            materialTypeId={record.id}
            surfaceOptions={surfaceOptions}
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              {tr("この材種の素材")}
            </Text>
            {record.materials.length === 0 ? (
              <Text c="dimmed" size="sm">
                {tr("この材種に紐づく素材はありません")}
              </Text>
            ) : (
              <Table highlightOnHover striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{tr("素材コード")}</Table.Th>
                    <Table.Th>{tr("名称")}</Table.Th>
                    {!isMobile && <Table.Th>{tr("寸法")}</Table.Th>}
                    {!isMobile && <Table.Th>{tr("単位")}</Table.Th>}
                    <Table.Th>{tr("状態")}</Table.Th>
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
