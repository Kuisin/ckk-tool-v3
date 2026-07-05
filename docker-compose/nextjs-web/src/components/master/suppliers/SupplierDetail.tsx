"use client";

/**
 * SupplierDetail.tsx — 外注企業 詳細 (MS26, design.md §8.2).
 *
 * 外注依頼・素材発注の履歴タブは購買機能の導入後に追加する。
 */

import { Badge, Group, Stack, Tabs, Text } from "@mantine/core";
import { IconCircleMinus, IconHistory, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SupplierDetail as SupplierDetailData } from "@/app/(dashboard)/master/_shared/bp-data";
import { BpBaseSummary } from "@/components/master/bp/BpBaseSummary";
import {
  DeleteBpModal,
  ToggleBpActiveModal,
} from "@/components/master/bp/BpModals";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { DetailShell, ResourceActions } from "@/components/ui/shells";
import { VENDOR_TYPE_LABEL } from "@/lib/enum-labels";
import { formatDateTime } from "@/lib/format";

const BASE_PATH = "/master/suppliers";

export function SupplierDetail({ record }: { record: SupplierDetailData }) {
  const router = useRouter();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const target = {
    id: record.id,
    bpCode: record.bpCode,
    name: record.nameJa,
    isActive: record.isActive,
  };
  const a = record.attrs;

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
      breadcrumbs={[
        "マスタ",
        { label: "外注企業", href: BASE_PATH },
        record.bpCode,
      ]}
      createdAt={formatDateTime(record.createdAt)}
      status={
        <Group gap="xs">
          <Badge
            color={a.vendorType === "OUTSOURCE" ? "orange" : "teal"}
            size="sm"
            variant="light"
          >
            {VENDOR_TYPE_LABEL[a.vendorType] ?? a.vendorType}
          </Badge>
          <ActiveBadge active={record.isActive} />
        </Group>
      }
      title={record.nameJa}
      updatedAt={formatDateTime(record.updatedAt)}
    >
      <BpBaseSummary record={record} />

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="audit">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="lg">
            <Stack gap="xs">
              <Text fw={600} size="sm">
                取引条件
              </Text>
              <Group gap="xl" wrap="wrap">
                <FieldValue
                  label="旧システムコード"
                  value={a.vendorCode || "—"}
                />
                <FieldValue
                  label="締日"
                  value={
                    a.closingDay != null
                      ? a.closingDay === 31
                        ? "月末"
                        : `${a.closingDay}日`
                      : "—"
                  }
                />
                <FieldValue
                  label="支払サイト"
                  value={
                    a.paymentTermsDays != null ? `${a.paymentTermsDays}日` : "—"
                  }
                />
                <FieldValue
                  label="支払日"
                  value={a.paymentDay != null ? `${a.paymentDay}日` : "—"}
                />
                <FieldValue
                  label="標準リードタイム"
                  value={a.leadTimeDays != null ? `${a.leadTimeDays}日` : "—"}
                />
              </Group>
            </Stack>
            <Stack gap="xs">
              <Text fw={600} size="sm">
                振込先
              </Text>
              <Group gap="xl" wrap="wrap">
                <FieldValue label="銀行名" value={a.bankName || "—"} />
                <FieldValue label="支店名" value={a.bankBranch || "—"} />
                <FieldValue label="口座種別" value={a.bankAccountType || "—"} />
                <FieldValue
                  label="口座番号"
                  value={a.bankAccountNumber || "—"}
                />
              </Group>
            </Stack>
            <FieldValue label="備考" value={record.notes || "—"} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="audit">
          <EmptyState
            icon={<IconHistory size={24} />}
            message="変更履歴はまだ記録されていません"
          />
        </Tabs.Panel>
      </Tabs>

      <DeleteBpModal
        entityLabel="外注企業"
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleBpActiveModal
        entityLabel="外注企業"
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
