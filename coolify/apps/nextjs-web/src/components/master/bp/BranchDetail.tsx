"use client";

/**
 * BranchDetail.tsx — 支店 詳細（取引先配下）.
 */

import { Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import type { BranchDetail as BranchDetailData } from "@/app/(dashboard)/master/_shared/bp-data";
import { BP_BASE_PATH } from "@/app/(dashboard)/master/_shared/bp-paths";
import { deleteBranch } from "@/app/(dashboard)/master/business-partners/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { BpBaseSummary } from "@/components/master/bp/BpBaseSummary";
import { ContactsTable } from "@/components/master/bp/ContactsTable";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { openConfirm } from "@/components/ui/modals";
import { DetailShell, ResourceActions } from "@/components/ui/shells";

export function BranchDetail({ record }: { record: BranchDetailData }) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const parentPath = `${BP_BASE_PATH}/${record.parentId}`;

  const handleDelete = () => {
    openConfirm({
      title: tr("master.bp.deleteTheBranch"),
      message: `支店「${record.nameJa}（${record.bpCode}）」を削除します。この操作は取り消せません。`,
      confirmLabel: tr("common.delete2"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteBranch(record.parentId, record.id);
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: `支店「${record.nameJa}」を削除しました`,
              color: "green",
            });
            router.push(parentPath);
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
              color: "red",
            });
          }
        });
      },
    });
  };

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            {
              label: "削除",
              icon: <IconTrash size={14} />,
              color: "red",
              onClick: handleDelete,
            },
          ]}
          onEdit={() => router.push(`${parentPath}/branches/${record.id}/edit`)}
        />
      }
      breadcrumbs={[
        tr("common.masterData"),
        { label: tr("common.businessPartners"), href: BP_BASE_PATH },
        { label: record.parentName, href: parentPath },
        record.bpCode,
      ]}
      createdAt={fmt.dateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={fmt.dateTime(record.updatedAt)}
    >
      <BpBaseSummary
        extra={
          <FieldValue
            label={tr("master.bp.parentCompany")}
            value={
              <DocNumber c="blue">
                {record.parentBpCode}（{record.parentName}）
              </DocNumber>
            }
          />
        }
        record={record}
      />

      <Stack gap="xs">
        <ContactsTable
          bpId={record.id}
          bpName={record.nameJa}
          contacts={record.contacts}
        />
      </Stack>

      <FieldValue label={tr("common.notes")} value={record.notes || "—"} />
    </DetailShell>
  );
}
