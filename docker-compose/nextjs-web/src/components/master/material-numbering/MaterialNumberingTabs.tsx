"use client";

/**
 * MaterialNumberingTabs.tsx — 採番構成 (MS0C) 管理画面。
 *
 * 材種/素材コードの構成要素 7 テーブルをタブで一覧・追加・有効/無効切替する。
 * 材種コード = [メーカー][メーカー材種][形状][種類]、
 * 素材コード = [材種]-[黒皮研磨][直径]-[全長]。
 */

import { Alert, Stack, Tabs, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useState } from "react";
import type { ComponentTableKind } from "@/app/(dashboard)/master/material-numbering/actions";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { PageHeader } from "@/components/ui/PageHeader";
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

const TABS: {
  value: ComponentTableKind;
  label: string;
  dataKey: keyof MaterialNumberingData;
  parentHeader?: string;
  extraHeader?: string;
}[] = [
  { value: "manufacturer", label: "メーカー", dataKey: "manufacturers" },
  {
    value: "grade",
    label: "メーカー材種",
    dataKey: "grades",
    parentHeader: "メーカー",
  },
  { value: "shape", label: "形状", dataKey: "shapes" },
  { value: "kind", label: "種類", dataKey: "kinds", parentHeader: "形状" },
  { value: "finish", label: "黒皮・研磨", dataKey: "finishes" },
  {
    value: "diameter",
    label: "直径",
    dataKey: "diameters",
    extraHeader: "直径 (mm)",
  },
  {
    value: "length",
    label: "全長",
    dataKey: "lengths",
    extraHeader: "全長 (mm)",
  },
];

export function MaterialNumberingTabs({
  data,
}: {
  data: MaterialNumberingData;
}) {
  const [active, setActive] = useState<ComponentTableKind>("manufacturer");
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
            {tab.label}を追加
          </PrimaryButton>
        }
        breadcrumbs={["マスタ", "採番構成"]}
        title="採番構成"
      />

      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        <Text size="xs">
          材種コード = <DocNumber>[メーカー][材種2桁][形状][種類4桁]</DocNumber>
          、素材コード ={" "}
          <DocNumber>[材種]-[黒皮研磨][径×10 3桁]-[全長3桁]</DocNumber>。
          コードは合成コードに埋め込まれるため削除できません（無効化のみ）。
          直径・全長は素材作成時にも自動登録されます。
        </Text>
      </Alert>

      <Tabs
        onChange={(v) => setActive((v as ComponentTableKind) ?? "manufacturer")}
        value={active}
      >
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
      </Tabs>

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
