"use client";

/**
 * PlantDetail.tsx — 拠点 詳細 (MS2C, design.md §8.2 / §13.6).
 *
 * サマリーグリッドに連絡先・住所を表示する。タブは 概要（備考）と
 * フロアマップ（端末管理 SY09 と共用の拠点図面の管理）のみ。
 * 保管場所の管理は専用アプリ 保管場所 (MS0E, /master/storage-locations) へ移設。
 */

import { Stack, Tabs } from "@mantine/core";
import { IconCircleMinus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { AppTabs } from "@/components/ui/AppTabs";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import {
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { countryLabel } from "@/lib/enum-labels";
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
  const tr = useTranslations();
  const locale = useLocale();
  const fmt = useFormat();
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
        { label: tr("master.plantDetail.plantsLabel"), href: BASE_PATH },
        record.code,
      ]}
      createdAt={fmt.dateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={fmt.dateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("master.plants.siteCode")}
          value={<DocNumber>{record.code}</DocNumber>}
        />
        <FieldValue label={tr("common.nameJapanese")} value={record.nameJa} />
        <FieldValue
          label={tr("common.nameEnglish")}
          value={record.nameEn || "—"}
        />
        <FieldValue label={tr("common.kana2")} value={record.nameKana || "—"} />
        <FieldValue
          label={tr("common.country")}
          value={
            record.countryCode
              ? (countryLabel(record.countryCode, locale) ?? record.countryCode)
              : "—"
          }
        />
        <FieldValue
          label={tr("common.postalCode")}
          value={record.postalCode || "—"}
        />
        <FieldValue
          label={tr("master.plants.addressJapanese")}
          value={record.addressJa || "—"}
        />
        <FieldValue
          label={tr("master.plants.addressEnglish")}
          value={record.addressEn || "—"}
        />
        <FieldValue
          label={tr("common.phoneNumber")}
          value={record.phone || "—"}
        />
        <FieldValue
          label={tr("common.emailAddress")}
          value={record.email || "—"}
        />
        <FieldValue
          label={tr("common.assignee")}
          value={record.contactPerson || "—"}
        />
      </SummaryGrid>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="floor-maps">{tr("common.floorMap")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <FieldValue
              label={tr("common.notes")}
              value={record.notes || "—"}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="floor-maps">
          <FloorMapsPanel floorMaps={floorMaps} plantId={record.id} />
        </Tabs.Panel>
      </AppTabs>

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
