"use client";

/**
 * EndUserDetail.tsx — 最終需要家 詳細 (MS22, design.md §8.2).
 */

import { Stack } from "@mantine/core";
import { IconCircleMinus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EndUserDetail as EndUserDetailData } from "@/app/(dashboard)/master/_shared/bp-data";
import { BpBaseSummary } from "@/components/master/bp/BpBaseSummary";
import {
  DeleteBpModal,
  ToggleBpActiveModal,
} from "@/components/master/bp/BpModals";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { FieldValue } from "@/components/ui/FieldValue";
import { DetailShell, ResourceActions } from "@/components/ui/shells";
import { formatDateTime } from "@/lib/format";

const BASE_PATH = "/master/end-users";

export function EndUserDetail({ record }: { record: EndUserDetailData }) {
  const router = useRouter();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const target = {
    id: record.id,
    bpCode: record.bpCode,
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
      breadcrumbs={[
        "マスタ",
        { label: "最終需要家", href: BASE_PATH },
        record.bpCode,
      ]}
      createdAt={formatDateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={formatDateTime(record.updatedAt)}
    >
      <BpBaseSummary
        extra={<FieldValue label="業種" value={record.industry || "—"} />}
        record={record}
      />

      <Stack gap="xs">
        <FieldValue label="備考" value={record.notes || "—"} />
        <FieldValue label="需要家メモ" value={record.attrNotes || "—"} />
      </Stack>

      <DeleteBpModal
        entityLabel="最終需要家"
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleBpActiveModal
        entityLabel="最終需要家"
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
