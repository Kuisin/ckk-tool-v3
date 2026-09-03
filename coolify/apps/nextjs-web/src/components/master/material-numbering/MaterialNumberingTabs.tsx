"use client";

/**
 * MaterialNumberingTabs.tsx — 採番構成 (MS07) 管理画面。
 *
 * 材種/素材コードの構成要素 7 テーブルをタブで一覧・追加・有効/無効切替する。
 * 材種コード = [メーカー][メーカー材種][形状][種類]、
 * 素材コード = [材種]-[黒皮研磨][直径]-[全長]。
 */

import { Alert, Stack, Tabs, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ComponentTableKind } from "@/app/(dashboard)/master/material-numbering/actions";
import { AppTabs } from "@/components/ui/AppTabs";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTabParam } from "@/hooks/useUrlState";
import type { Option } from "@/lib/mock";
import { AddComponentModal } from "./AddComponentModal";
import { type ComponentRow, ComponentTable } from "./ComponentTable";

export interface MaterialNumberingData {
  manufacturers: ComponentRow[];
  grades: ComponentRow[];
  shapes: ComponentRow[];
  kinds: ComponentRow[];
  finishes: ComponentRow[];
  diameters: ComponentRow[];
  lengths: ComponentRow[];
}

export function MaterialNumberingTabs({
  data,
}: {
  data: MaterialNumberingData;
}) {
  const tr = useTranslations();
  const TABS: {
    value: ComponentTableKind;
    label: string;
    dataKey: keyof MaterialNumberingData;
    parentHeader?: string;
    extraHeader?: string;
  }[] = [
    {
      value: "manufacturer",
      label: tr("common.manufacturer"),
      dataKey: "manufacturers",
    },
    {
      value: "grade",
      label: tr("master.materialTypes.manufacturerGrade"),
      dataKey: "grades",
      parentHeader: tr("common.manufacturer"),
    },
    { value: "shape", label: tr("common.shape"), dataKey: "shapes" },
    {
      value: "kind",
      label: tr("common.kind"),
      dataKey: "kinds",
      parentHeader: tr("common.shape"),
    },
    {
      value: "finish",
      label: tr("common.surfaceFinish"),
      dataKey: "finishes",
    },
    {
      value: "diameter",
      label: tr("common.diameter"),
      dataKey: "diameters",
      extraHeader: tr("common.diameterMm"),
    },
    {
      value: "length",
      label: tr("common.overallLength"),
      dataKey: "lengths",
      extraHeader: tr("common.overallLengthMm"),
    },
  ];
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tabParam, setTab] = useTabParam("manufacturer");
  const active: ComponentTableKind = TABS.some((t) => t.value === tabParam)
    ? (tabParam as ComponentTableKind)
    : "manufacturer";
  const [addOpen, setAddOpen] = useState(false);

  // 追加モーダルの親 options（grade → 有効メーカー / kind → 有効形状）
  const manufacturerOptions: Option[] = data.manufacturers
    .filter((r) => r.isActive)
    .map((r) => ({ value: r.code, label: `${r.code} — ${r.name}` }));
  const shapeOptions: Option[] = data.shapes
    .filter((r) => r.isActive)
    .map((r) => ({ value: r.code, label: `${r.code} — ${r.name}` }));

  const tab = TABS.find((t) => t.value === active) ?? TABS[0];

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <PrimaryButton onClick={() => setAddOpen(true)}>
            {tr("master.materialNumberingTabs.addButtonLabel", {
              label: tab.label,
            })}
          </PrimaryButton>
        }
        breadcrumbs={[
          tr("common.masterData"),
          tr("master.materialNumbering.codeNumbering"),
        ]}
        title={tr("master.materialNumbering.codeNumbering")}
      />

      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        <Text size="xs">
          {tr("master.materialNumbering.materialTypeCode")}{" "}
          <DocNumber>
            {tr("master.materialNumbering.manufacturerGrade2ShapeKind4")}
          </DocNumber>
          、素材コード ={" "}
          <DocNumber>
            {tr("master.materialNumbering.materialTypeFinishDia103")}
          </DocNumber>
          {tr("master.materialNumbering.codesAreEmbeddedInCompositeCodes")}
        </Text>
      </Alert>

      <AppTabs onChange={setTab} value={active}>
        <Tabs.List>
          {TABS.map((t) => (
            <Tabs.Tab key={t.value} value={t.value}>
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {TABS.map((t) => (
          <Tabs.Panel key={t.value} pt="md" value={t.value}>
            <ComponentTable
              extraHeader={t.extraHeader}
              kind={t.value}
              parentHeader={t.parentHeader}
              rows={data[t.dataKey]}
            />
          </Tabs.Panel>
        ))}
      </AppTabs>

      <AddComponentModal
        kind={active}
        onClose={() => setAddOpen(false)}
        opened={addOpen}
        parentOptions={
          active === "grade"
            ? manufacturerOptions
            : active === "kind"
              ? shapeOptions
              : []
        }
      />
    </Stack>
  );
}
