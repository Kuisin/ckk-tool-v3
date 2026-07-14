"use client";

/**
 * ApprovalGroupDetail.tsx — 承認グループ 詳細 (MS2A, design.md §8.2 / §13.5).
 *
 * サマリ（名称・種別・状態）+ タブ: グループ情報 / メンバー / 代理設定 / 履歴。
 * メンバーはタブ内でインライン追加・削除・有効/無効切替する。
 * 代理設定は承認フロー本実装時に対応（EmptyState 表示）。
 */

import {
  ActionIcon,
  Group,
  ScrollArea,
  Stack,
  Table,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCircleMinus,
  IconPlus,
  IconTrash,
  IconUserShield,
  IconUsers,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setGroupMemberActive } from "@/app/(dashboard)/master/approval-groups/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { GhostButton } from "@/components/ui/buttons";
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
import {
  AddApprovalGroupMemberModal,
  type ApprovalGroupMemberTarget,
  DeleteApprovalGroupModal,
  RemoveApprovalGroupMemberModal,
  ToggleApprovalGroupActiveModal,
} from "./ApprovalGroupModals";
import { ApprovalGroupTypeBadge } from "./ApprovalGroupTable";

const BASE_PATH = "/master/approval-groups";

export interface ApprovalGroupMemberRow {
  userId: string;
  displayName: string;
  username: string;
  isActive: boolean;
}

export interface ApprovalGroupDetailData {
  id: number;
  type: string;
  nameJa: string;
  nameEn: string;
  isActive: boolean;
  members: ApprovalGroupMemberRow[];
}

export function ApprovalGroupDetail({
  record,
  auditEntries,
}: {
  record: ApprovalGroupDetailData;
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [removeMember, setRemoveMember] =
    useState<ApprovalGroupMemberTarget | null>(null);

  const target = {
    id: record.id,
    name: record.nameJa,
    isActive: record.isActive,
  };

  const activeCount = record.members.filter((m) => m.isActive).length;

  // メンバーの有効/無効切替（容易に戻せる操作なので確認モーダルなし）
  const toggleMemberActive = (member: ApprovalGroupMemberRow) => {
    startTransition(async () => {
      const result = await setGroupMemberActive(
        record.id,
        member.userId,
        !member.isActive,
      );
      if (result.ok) {
        notifications.show({
          title: member.isActive ? "無効化しました" : "有効化しました",
          message: `メンバー「${member.displayName}」を${member.isActive ? "無効化" : "有効化"}しました`,
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
        { label: "承認グループ", href: BASE_PATH },
        record.nameJa,
      ]}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
    >
      <SummaryGrid>
        <FieldValue label="名称" value={record.nameJa} />
        <FieldValue
          label="種別"
          value={<ApprovalGroupTypeBadge type={record.type} />}
        />
        <FieldValue
          label="メンバー数"
          value={`${activeCount}名（有効） / ${record.members.length}名`}
        />
        <FieldValue
          label="状態"
          value={<ActiveBadge active={record.isActive} />}
        />
      </SummaryGrid>

      <Tabs defaultValue="info">
        <Tabs.List>
          <Tabs.Tab value="info">グループ情報</Tabs.Tab>
          <Tabs.Tab value="members">メンバー</Tabs.Tab>
          <Tabs.Tab value="delegates">代理設定</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="info">
          <Stack gap="sm">
            <FieldValue label="名称（日本語）" value={record.nameJa} />
            <FieldValue label="名称（英語）" value={record.nameEn || "—"} />
            <FieldValue
              label="種別"
              value={<ApprovalGroupTypeBadge type={record.type} />}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="members">
          <Stack gap="sm">
            <Group justify="flex-end">
              <GhostButton
                leftSection={<IconPlus size={14} />}
                onClick={() => setAddMemberOpen(true)}
              >
                メンバーを追加
              </GhostButton>
            </Group>
            {record.members.length === 0 ? (
              <EmptyState
                icon={<IconUsers size={24} />}
                message="メンバーがいません"
              />
            ) : (
              <ScrollArea>
                <Table striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>氏名</Table.Th>
                      <Table.Th w={200}>ユーザー名</Table.Th>
                      <Table.Th w={90}>状態</Table.Th>
                      <Table.Th w={80} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {record.members.map((m) => (
                      <Table.Tr key={m.userId}>
                        <Table.Td>
                          <Text fw={500} size="sm">
                            {m.displayName}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <DocNumber c="dimmed">{m.username}</DocNumber>
                        </Table.Td>
                        <Table.Td>
                          <ActiveBadge active={m.isActive} />
                        </Table.Td>
                        <Table.Td>
                          <Group gap={4} justify="flex-end" wrap="nowrap">
                            <Tooltip
                              label={m.isActive ? "無効化" : "有効化"}
                              withinPortal
                            >
                              <ActionIcon
                                aria-label={
                                  m.isActive
                                    ? "メンバーを無効化"
                                    : "メンバーを有効化"
                                }
                                color={m.isActive ? "orange" : "green"}
                                onClick={() => toggleMemberActive(m)}
                                variant="subtle"
                              >
                                <IconCircleMinus size={14} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="削除" withinPortal>
                              <ActionIcon
                                aria-label="メンバーを削除"
                                color="red"
                                onClick={() => setRemoveMember(m)}
                                variant="subtle"
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="delegates">
          <EmptyState
            icon={<IconUserShield size={24} />}
            message="代理設定は承認フロー本実装時に対応します"
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <DeleteApprovalGroupModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleApprovalGroupActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
      <AddApprovalGroupMemberModal
        groupId={record.id}
        onClose={() => setAddMemberOpen(false)}
        onDone={() => router.refresh()}
        opened={addMemberOpen}
      />
      <RemoveApprovalGroupMemberModal
        groupId={record.id}
        member={removeMember}
        onClose={() => setRemoveMember(null)}
        onDone={() => router.refresh()}
        opened={!!removeMember}
      />
    </DetailShell>
  );
}
