"use client";

/**
 * PlantDetail.tsx — 拠点 詳細 (MS2B, design.md §8.2 / §13.6).
 *
 * サマリーグリッドに連絡先・住所を表示する。タブは 概要（備考）と
 * フロアマップ（端末管理 SY09 と共用の拠点図面の管理）のみ。
 * 保管場所の管理は専用アプリ 保管場所 (MS0E, /master/storage-locations) へ移設。
 */

import { Stack, Tabs } from "@mantine/core";
import { IconCircleMinus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import {
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { COUNTRY_LABEL } from "@/lib/enum-labels";
import { formatDateTime } from "@/lib/format";
import { FloorMapsPanel, type PlantFloorMapRef } from "./FloorMapsPanel";
import { DeletePlantModal, TogglePlantActiveModal } from "./PlantModals";

const BASE_PATH = "/master/plants";

export interface PlantDetailData {
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

export function PlantDetail({
  record,
  floorMaps,
}: {
  record: PlantDetailData;
  floorMaps: PlantFloorMapRef[];
}) {
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");

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
      breadcrumbs={["マスタ", { label: "拠点", href: BASE_PATH }, record.code]}
      createdAt={formatDateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={formatDateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="拠点コード"
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

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="floor-maps">フロアマップ</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <FieldValue label="備考" value={record.notes || "—"} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="floor-maps">
          <FloorMapsPanel floorMaps={floorMaps} plantId={record.id} />
        </Tabs.Panel>
      </Tabs>

      <DeletePlantModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <TogglePlantActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
