"use client";

/**
 * FactoryDetail.tsx — 工場 詳細 (MS2B, design.md §8.2 / §13.6).
 *
 * サマリーグリッドに連絡先・住所を表示する。関連タブ（在庫サマリ（工場別）・
 * 実行中工程）は在庫/製造機能の導入時に接続する（現状は EmptyState）。
 */

import { Stack, Tabs } from "@mantine/core";
import {
  IconBuildingWarehouse,
  IconCircleMinus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
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
import { COUNTRY_LABEL } from "@/lib/enum-labels";
import { formatDateTime } from "@/lib/format";
import { DeleteFactoryModal, ToggleFactoryActiveModal } from "./FactoryModals";

const BASE_PATH = "/master/factories";

export interface FactoryDetailData {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  nameKana: string;
  countryCode: string | null;
  postalCode: string;
  addressJa: string;
  addressEn: string;
  phone: string;
  email: string;
  contactPerson: string;
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export function FactoryDetail({
  record,
  auditEntries,
}: {
  record: FactoryDetailData;
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const target = {
    id: record.id,
    code: record.code,
    name: record.nameJa,
    isActive: record.isActive,
  };

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            {
              label: record.isActive ? "無効化" : "有効化",
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
      breadcrumbs={["マスタ", { label: "工場", href: BASE_PATH }, record.code]}
      createdAt={formatDateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={formatDateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="工場コード"
          value={<DocNumber>{record.code}</DocNumber>}
        />
        <FieldValue label="名称（日本語）" value={record.nameJa} />
        <FieldValue label="名称（英語）" value={record.nameEn || "—"} />
        <FieldValue label="よみがな" value={record.nameKana || "—"} />
        <FieldValue
          label="国"
          value={
            record.countryCode
              ? (COUNTRY_LABEL[record.countryCode] ?? record.countryCode)
              : "—"
          }
        />
        <FieldValue label="郵便番号" value={record.postalCode || "—"} />
        <FieldValue label="住所（日本語）" value={record.addressJa || "—"} />
        <FieldValue label="住所（英語）" value={record.addressEn || "—"} />
        <FieldValue label="電話番号" value={record.phone || "—"} />
        <FieldValue label="メールアドレス" value={record.email || "—"} />
        <FieldValue label="担当者" value={record.contactPerson || "—"} />
      </SummaryGrid>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <FieldValue label="備考" value={record.notes || "—"} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <EmptyState
            icon={<IconBuildingWarehouse size={24} />}
            message="在庫サマリ・実行中工程は在庫/製造機能の導入後に表示します"
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <DeleteFactoryModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleFactoryActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
