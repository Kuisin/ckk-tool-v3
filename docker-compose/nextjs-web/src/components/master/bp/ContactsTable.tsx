"use client";

/**
 * ContactsTable.tsx — BP 担当者一覧（顧客・支店の詳細で共通）。
 *
 * 追加は AddContactModal、削除は共通 Server Action（deleteContact）。
 */

import { ActionIcon, Badge, Group, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash, IconUsers } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteContact } from "@/app/(dashboard)/master/_shared/bp-actions";
import type { ContactRow } from "@/app/(dashboard)/master/_shared/bp-data";
import { GhostButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { openConfirm } from "@/components/ui/modals";
import { useIsMobile } from "@/hooks/useViewport";
import { AddContactModal } from "./BpModals";

export function ContactsTable({
  bpId,
  bpName,
  contacts,
}: {
  bpId: string;
  bpName: string;
  contacts: ContactRow[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);

  const handleDelete = (c: ContactRow) => {
    openConfirm({
      title: "担当者の削除",
      message: `担当者「${c.name}」を削除します。この操作は取り消せません。`,
      confirmLabel: "削除する",
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteContact(bpId, c.id);
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `担当者「${c.name}」を削除しました`,
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: "エラー",
              message: result.error,
              color: "red",
            });
          }
        });
      },
    });
  };

  return (
    <>
      <Group justify="space-between" mb="xs">
        <Text fw={600} size="sm">
          担当者
        </Text>
        <GhostButton
          leftSection={<IconPlus size={14} />}
          onClick={() => setAddOpen(true)}
        >
          担当者を追加
        </GhostButton>
      </Group>
      {contacts.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={24} />}
          message="担当者は登録されていません"
        />
      ) : (
        <Table highlightOnHover striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>氏名</Table.Th>
              {!isMobile && <Table.Th>部署 / 役職</Table.Th>}
              <Table.Th>連絡先</Table.Th>
              <Table.Th w={60} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {contacts.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    <Text size="sm">{c.name}</Text>
                    {c.isPrimary && (
                      <Badge color="blue" size="xs" variant="light">
                        主担当
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                {!isMobile && (
                  <Table.Td>
                    <Text c="dimmed" size="sm">
                      {[c.department, c.title].filter(Boolean).join(" / ") ||
                        "—"}
                    </Text>
                  </Table.Td>
                )}
                <Table.Td>
                  <Text size="sm">{c.email || c.phone || "—"}</Text>
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    aria-label="担当者を削除"
                    color="red"
                    onClick={() => handleDelete(c)}
                    variant="subtle"
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <AddContactModal
        bpId={bpId}
        bpName={bpName}
        onClose={() => setAddOpen(false)}
        onDone={() => router.refresh()}
        opened={addOpen}
      />
    </>
  );
}
