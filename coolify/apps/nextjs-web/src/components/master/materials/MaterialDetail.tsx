"use client";

/**
 * MaterialDetail.tsx — 素材 詳細 (MS26, design.md §8.2).
 *
 * コード構成（材種×黒皮研磨×径×全長×種類）のサマリ + 関連（使用製品）+
 * 履歴（audit_logs）。構成は作成後不変なので表示のみ。
 */

import { Stack, Tabs, Text } from "@mantine/core";
import { IconCircleMinus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { KeywordBadges } from "@/components/master/MasterKeywordsField";
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
import { useTabParam } from "@/hooks/useUrlState";
import {
  DeleteMaterialModal,
  ToggleMaterialActiveModal,
} from "./MaterialModals";

const BASE_PATH = "/master/materials";

export interface MaterialDetailData {
  id: number;
  code: string;
  materialTypeId: number;
  materialTypeCode: string;
  materialTypeName: string;
  surfaceFinish: string;
  diameterMm: number;
  lengthMm: number;
  kindCode: string;
  nominalDiameterMm: number | null;
  manufacturerModel: string;
  nameJa: string;
  nameEn: string;
  unit: string;
  /** 検索・AI 突合用のキーワード（match_names）。 */
  matchNames: string[];
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export function MaterialDetail({
  record,
  auditEntries,
}: {
  record: MaterialDetailData;
  auditEntries: AuditEntry[];
}) {
  const tr = useTranslations();
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
              label: record.isActive ? "無効化" : tr("common.enable"),
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
        tr("common.masterData"),
        { label: tr("common.materials"), href: BASE_PATH },
        record.code,
      ]}
      createdAt={fmt.dateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={fmt.dateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("common.materialCode")}
          value={<DocNumber>{record.code}</DocNumber>}
        />
        <FieldValue
          label={tr("common.materialTypes")}
          value={
            <DocNumber c="blue">
              {record.materialTypeCode}
              {record.materialTypeName ? `（${record.materialTypeName}）` : ""}
            </DocNumber>
          }
        />
        <FieldValue
          label={tr("common.surfaceFinish")}
          value={record.surfaceFinish}
        />
        <FieldValue
          label={tr("common.diameter")}
          value={`φ${record.diameterMm} mm`}
        />
        <FieldValue
          label={tr("common.overallLength")}
          value={`${record.lengthMm} mm`}
        />
        <FieldValue
          label={tr("common.kind")}
          value={<DocNumber>{record.kindCode}</DocNumber>}
        />
        <FieldValue
          label={tr("master.materials.nominalDiameter")}
          value={
            record.nominalDiameterMm != null
              ? `φ${record.nominalDiameterMm} mm`
              : "—"
          }
        />
        <FieldValue
          label={tr("common.manufacturerModel")}
          value={record.manufacturerModel || "—"}
        />
        <FieldValue label={tr("common.unit")} value={record.unit} />
      </SummaryGrid>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="related">{tr("common.related")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
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
              label={tr("common.keywords")}
              value={<KeywordBadges values={record.matchNames} />}
            />
            <FieldValue
              label={tr("common.notes")}
              value={record.notes || "—"}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              {tr("master.materials.productsUsingIt")}
            </Text>
            <Text c="dimmed" size="sm">
              {tr("master.materials.productsSpecifyMaterialAsTypeDiameter")}
            </Text>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <DeleteMaterialModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleMaterialActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
