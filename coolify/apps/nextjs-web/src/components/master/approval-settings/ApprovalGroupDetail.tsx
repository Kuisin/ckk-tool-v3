"use client";

/**
 * ApprovalGroupDetail.tsx — 承認グループ 詳細 (MS2B, design.md §8.2 / §13.5).
 *
 * サマリ（名称・種別・状態）+ タブ: グループ情報 / メンバー / 代理設定 / 履歴。
 * メンバー・代理人には「この書類の承認権限を持っているか」を並べる — 承認
 * グループに入れただけでは押せず、書類の閲覧・編集権限（`<code>:READ / UPDATE`）が要るため
 * （lib/approval-permissions.ts）。
 * メンバーはタブ内でインライン追加・削除・有効/無効切替する。
 * 代理設定（approval_delegates — 期間限定代理）はタブ内で追加・削除する。
 *
 * モバイル（design.md §20.2）: 表の副次列は畳んで氏名の下に積む
 * （bp/ContactsTable と同じ手）。5 列のまま横スクロールさせると、
 * 操作アイコンが画面外に出て「押せない」状態になるため。
 */

import {
  ActionIcon,
  Alert,
  Badge,
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
  IconCalendarClock,
  IconCircleMinus,
  IconPlus,
  IconShieldCheck,
  IconTrash,
  IconUserShield,
  IconUsers,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setGroupMemberActive } from "@/app/(dashboard)/master/approval-settings/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { AppTabs } from "@/components/ui/AppTabs";
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
import { useTabParam } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  isMemberEffective,
  MEMBER_PERIOD_STATE_COLOR,
  memberPeriodState,
  memberPeriodStateLabel,
} from "@/lib/approval-membership";
import { permissionScopeLabel } from "@/lib/enum-labels";
import {
  AddApprovalDelegateModal,
  AddApprovalGroupMemberModal,
  type ApprovalDelegateTarget,
  type ApprovalGroupMemberTarget,
  DeleteApprovalGroupModal,
  EditMemberPeriodModal,
  type MemberPeriodTarget,
  RemoveApprovalDelegateModal,
  RemoveApprovalGroupMemberModal,
  ToggleApprovalGroupActiveModal,
} from "./ApprovalGroupModals";

const BASE_PATH = "/master/approval-settings";

/** このグループが承認を任されている書類 1 つぶん。 */
export interface GroupFlowUsage {
  targetType: string;
  /** 書類名（注文請書 …）。 */
  label: string;
  /** バッジ色（APPROVAL_TARGET の色）。 */
  color: string;
  /** 承認に必要な権限コード（書類の READ / UPDATE を突き合わせる）。 */
  permissionCode: string;
  /** この書類で任されている段（「1. 第一承認」）。 */
  steps: string[];
}

/** 1 人 × 1 書類の承認権限。 */
export interface MemberApproval {
  targetType: string;
  label: string;
  permissionCode: string;
  /** 書類の READ / UPDATE を持つか。false = 承認ボタンを押しても弾かれる。 */
  allowed: boolean;
  /** 全社スコープか。false = 拠点等に限定され、書類によっては押せない。 */
  unrestricted: boolean;
  scopes: string[];
}

export interface ApprovalGroupMemberRow {
  userId: string;
  displayName: string;
  username: string;
  isActive: boolean;
  /** 期間限定メンバーの在籍期間（ISO）。常任は両方 null。 */
  validFrom: string | null;
  validUntil: string | null;
  note: string | null;
  /** このグループが任されている書類ごとの承認権限。 */
  approvals: MemberApproval[];
}

/** 期間限定代理（approval_delegates）の 1 行。 */
export interface ApprovalGroupDelegateRow {
  id: string;
  delegatorId: string;
  delegatorName: string;
  delegateId: string;
  delegateName: string;
  validFrom: string; // ISO
  validUntil: string; // ISO
  reason: string | null;
  /** 代理人自身の承認権限（代理でも押すのは本人の権限）。 */
  approvals: MemberApproval[];
}

export interface ApprovalGroupDetailData {
  id: number;
  nameJa: string;
  nameEn: string;
  isActive: boolean;
  /** このグループが承認を任されている書類（承認フローの段）。 */
  usages: GroupFlowUsage[];
  members: ApprovalGroupMemberRow[];
  delegates: ApprovalGroupDelegateRow[];
}

/** 在籍期間の表示（常任は「常任」）。 */
function MemberPeriod({ member }: { member: ApprovalGroupMemberRow }) {
  const tr = useTranslations();
  const fmt = useFormat();
  if (!member.validFrom || !member.validUntil) {
    return (
      <Text c="dimmed" size="sm">
        {tr("common.permanent")}
      </Text>
    );
  }
  return (
    <Stack gap={0}>
      <Text className="tabular-nums" size="xs">
        {fmt.dateTime(member.validFrom)} 〜 {fmt.dateTime(member.validUntil)}
      </Text>
      {member.note && (
        <Text c="dimmed" size="xs" truncate>
          {member.note}
        </Text>
      )}
    </Stack>
  );
}

/**
 * このグループが承認を任されている書類と、そのために要る権限。
 * どこにも使われていないグループは、その旨を出す（メンバーを入れても
 * 何も起きないため）。
 */
function GroupUsageNote({ usages }: { usages: GroupFlowUsage[] }) {
  const tr = useTranslations();
  if (usages.length === 0) {
    return (
      <Alert color="gray" icon={<IconShieldCheck size={16} />} variant="light">
        {tr("master.approvalSettings.thisGroupIsNotUsedIn")}
      </Alert>
    );
  }
  return (
    <Alert
      color="gray"
      icon={<IconShieldCheck size={16} />}
      title={tr("master.approvalSettings.theDocumentsThisGroupApprovesAnd")}
      variant="light"
    >
      <Stack gap={4}>
        {usages.map((u) => (
          <Group gap="xs" key={u.targetType} wrap="wrap">
            <Badge color={u.color} size="sm" variant="light">
              {u.label}
            </Badge>
            <Text c="dimmed" size="xs">
              {u.steps.join(" / ")}
            </Text>
            <Text ff="mono" size="xs">
              {u.permissionCode}:READ / UPDATE
            </Text>
          </Group>
        ))}
        <Text c="dimmed" size="xs">
          {tr("master.approvalSettings.approvingNeedsPermissionToViewOr")}
        </Text>
      </Stack>
    </Alert>
  );
}

/** 1 人ぶんの承認権限バッジ列（書類ごとに 1 枚）。 */
function ApprovalPermissionCell({
  approvals,
}: {
  approvals: MemberApproval[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  if (approvals.length === 0) {
    return (
      <Text c="dimmed" size="xs">
        —
      </Text>
    );
  }
  return (
    <Group gap={4} wrap="wrap">
      {approvals.map((a) => {
        const color = a.allowed ? (a.unrestricted ? "green" : "yellow") : "red";
        const label = a.allowed
          ? a.unrestricted
            ? tr("master.approvalGroupDetail.canApprove", { label: a.label })
            : tr("master.approvalGroupDetail.canApproveScoped", {
                label: a.label,
                scopes: a.scopes
                  .map((s) => permissionScopeLabel(s, locale))
                  .join(tr("common.s1")),
              })
          : tr("master.approvalGroupDetail.cannotApprove", {
              label: a.label,
              code: a.permissionCode,
            });
        return (
          <Tooltip key={a.targetType} label={label} withinPortal>
            <Badge color={color} size="sm" variant="light">
              {a.label}
            </Badge>
          </Tooltip>
        );
      })}
    </Group>
  );
}

/** 常任 / 有効中 / 期間前 / 期間終了 / 無効。 */
function MemberStateBadge({
  member,
  now,
}: {
  member: ApprovalGroupMemberRow;
  now: Date;
}) {
  const locale = useLocale();
  const state = memberPeriodState(member, now);
  return (
    <Badge color={MEMBER_PERIOD_STATE_COLOR[state]} size="sm" variant="light">
      {memberPeriodStateLabel(state, locale)}
    </Badge>
  );
}

export function ApprovalGroupDetail({
  record,
  auditEntries,
}: {
  record: ApprovalGroupDetailData;
  auditEntries: AuditEntry[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("info");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [periodMember, setPeriodMember] = useState<MemberPeriodTarget | null>(
    null,
  );
  const [removeMember, setRemoveMember] =
    useState<ApprovalGroupMemberTarget | null>(null);
  const [addDelegateOpen, setAddDelegateOpen] = useState(false);
  const [removeDelegate, setRemoveDelegate] =
    useState<ApprovalDelegateTarget | null>(null);

  const target = {
    id: record.id,
    name: record.nameJa,
    isActive: record.isActive,
  };

  // 「有効」は今この瞬間に承認できる人 — 期間限定メンバーの期間外は数えない。
  const now = new Date();
  const activeCount = record.members.filter((m) =>
    isMemberEffective(m, now),
  ).length;

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
          title: member.isActive
            ? tr("common.disabled2")
            : tr("common.enabled2"),
          message: member.isActive
            ? tr("master.approvalGroupDetail.memberDisabledMessage", {
                name: member.displayName,
              })
            : tr("master.approvalGroupDetail.memberEnabledMessage", {
                name: member.displayName,
              }),
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
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
        { label: tr("common.approvalSettings"), href: BASE_PATH },
        record.nameJa,
      ]}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
    >
      <SummaryGrid>
        <FieldValue label={tr("common.name2")} value={record.nameJa} />
        <FieldValue
          label={tr("common.members")}
          value={tr("master.approvalGroupDetail.activeMemberCount", {
            active: activeCount,
            total: record.members.length,
          })}
        />
        <FieldValue
          label={tr("common.status")}
          value={<ActiveBadge active={record.isActive} />}
        />
      </SummaryGrid>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="info">
            {tr("master.approvalSettings.groupInformation")}
          </Tabs.Tab>
          <Tabs.Tab value="members">
            {tr("master.approvalSettings.members")}
          </Tabs.Tab>
          <Tabs.Tab value="delegates">
            {tr("master.approvalSettings.delegation")}
          </Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="info">
          <Stack gap="sm">
            <FieldValue
              label={tr("common.nameJapanese")}
              value={record.nameJa}
            />
            <FieldValue
              label={tr("common.nameEnglish")}
              value={record.nameEn || "—"}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="members">
          <Stack gap="sm">
            <GroupUsageNote usages={record.usages} />
            <Group justify="flex-end">
              <GhostButton
                fullWidth={isMobile}
                leftSection={<IconPlus size={14} />}
                onClick={() => setAddMemberOpen(true)}
              >
                {tr("master.approvalSettings.addAMember")}
              </GhostButton>
            </Group>
            {record.members.length === 0 ? (
              <EmptyState
                icon={<IconUsers size={24} />}
                message={tr("master.approvalSettings.thereAreNoMembers")}
              />
            ) : (
              <ScrollArea>
                <Table striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{tr("common.name3")}</Table.Th>
                      {!isMobile && (
                        <Table.Th w={180}>{tr("common.username")}</Table.Th>
                      )}
                      {!isMobile && (
                        <Table.Th w={200}>
                          {tr("master.approvalSettings.employmentPeriod")}
                        </Table.Th>
                      )}
                      {!isMobile && (
                        <Table.Th w={90}>{tr("common.status")}</Table.Th>
                      )}
                      {!isMobile && (
                        <Table.Th w={200}>
                          {tr("master.approvalSettings.approvalPermission")}
                        </Table.Th>
                      )}
                      <Table.Th w={110} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {record.members.map((m) => (
                      <Table.Tr key={m.userId}>
                        <Table.Td>
                          <Text fw={500} size="sm">
                            {m.displayName}
                          </Text>
                          {/* 畳んだ列はここへ積む（モバイルのみ）。状態バッジも
                              ここに入れる — 列に残すと氏名の幅が足りなくなる。 */}
                          {isMobile && (
                            <Stack align="flex-start" gap={2} mt={4}>
                              <MemberStateBadge member={m} now={now} />
                              <DocNumber c="dimmed">{m.username}</DocNumber>
                              <MemberPeriod member={m} />
                              <ApprovalPermissionCell approvals={m.approvals} />
                            </Stack>
                          )}
                        </Table.Td>
                        {!isMobile && (
                          <Table.Td>
                            <DocNumber c="dimmed">{m.username}</DocNumber>
                          </Table.Td>
                        )}
                        {!isMobile && (
                          <Table.Td>
                            <MemberPeriod member={m} />
                          </Table.Td>
                        )}
                        {!isMobile && (
                          <Table.Td>
                            <MemberStateBadge member={m} now={now} />
                          </Table.Td>
                        )}
                        {!isMobile && (
                          <Table.Td>
                            <ApprovalPermissionCell approvals={m.approvals} />
                          </Table.Td>
                        )}
                        <Table.Td>
                          <Group gap={4} justify="flex-end" wrap="nowrap">
                            <Tooltip
                              label={tr(
                                "master.approvalSettings.changeTheEmploymentPeriod",
                              )}
                              withinPortal
                            >
                              <ActionIcon
                                aria-label={tr(
                                  "master.approvalSettings.changeTheEmploymentPeriod",
                                )}
                                onClick={() => setPeriodMember(m)}
                                variant="subtle"
                              >
                                <IconCalendarClock size={14} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip
                              label={
                                m.isActive
                                  ? tr("common.disable")
                                  : tr("common.enable")
                              }
                              withinPortal
                            >
                              <ActionIcon
                                aria-label={
                                  m.isActive
                                    ? tr(
                                        "master.approvalSettings.disableTheMember",
                                      )
                                    : tr(
                                        "master.approvalSettings.enableTheMember",
                                      )
                                }
                                color={m.isActive ? "orange" : "green"}
                                onClick={() => toggleMemberActive(m)}
                                variant="subtle"
                              >
                                <IconCircleMinus size={14} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label={tr("common.delete")} withinPortal>
                              <ActionIcon
                                aria-label={tr(
                                  "master.approvalSettings.removeTheMember",
                                )}
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
          <Stack gap="sm">
            <Group justify="flex-end">
              <GhostButton
                fullWidth={isMobile}
                leftSection={<IconPlus size={14} />}
                onClick={() => setAddDelegateOpen(true)}
              >
                {tr("master.approvalSettings.addADelegation")}
              </GhostButton>
            </Group>
            {record.delegates.length === 0 ? (
              <EmptyState
                icon={<IconUserShield size={24} />}
                message={tr("master.approvalSettings.thereAreNoDelegations")}
              />
            ) : (
              <ScrollArea>
                <Table striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{tr("common.delegate")}</Table.Th>
                      {!isMobile && (
                        <Table.Th>{tr("common.originalApprover")}</Table.Th>
                      )}
                      {!isMobile && (
                        <Table.Th w={200}>{tr("common.period")}</Table.Th>
                      )}
                      {!isMobile && (
                        <Table.Th w={180}>
                          {tr("master.approvalSettings.approvalPermission")}
                        </Table.Th>
                      )}
                      {!isMobile && <Table.Th>{tr("common.reason")}</Table.Th>}
                      <Table.Th w={60} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {record.delegates.map((d) => (
                      <Table.Tr key={d.id}>
                        <Table.Td>
                          <Text fw={500} size="sm">
                            {d.delegateName}
                          </Text>
                          {/* 畳んだ列はここへ積む（モバイルのみ）。「誰の代理で
                              いつまでか」は代理設定の意味そのものなので省けない。 */}
                          {isMobile && (
                            <Stack gap={2} mt={4}>
                              <Text c="dimmed" size="xs">
                                {d.delegatorName} の代理
                              </Text>
                              <Text
                                c="dimmed"
                                className="tabular-nums"
                                size="xs"
                              >
                                {fmt.date(d.validFrom)}〜
                                {fmt.date(d.validUntil)}
                              </Text>
                              {d.reason && (
                                <Text c="dimmed" size="xs">
                                  {d.reason}
                                </Text>
                              )}
                              <ApprovalPermissionCell approvals={d.approvals} />
                            </Stack>
                          )}
                        </Table.Td>
                        {!isMobile && (
                          <Table.Td>
                            <Text size="sm">{d.delegatorName}</Text>
                          </Table.Td>
                        )}
                        {!isMobile && (
                          <Table.Td>
                            <Text className="tabular-nums" size="sm">
                              {fmt.date(d.validFrom)}〜{fmt.date(d.validUntil)}
                            </Text>
                          </Table.Td>
                        )}
                        {!isMobile && (
                          <Table.Td>
                            <ApprovalPermissionCell approvals={d.approvals} />
                          </Table.Td>
                        )}
                        {!isMobile && (
                          <Table.Td>
                            <Text c="dimmed" size="xs">
                              {d.reason ?? "—"}
                            </Text>
                          </Table.Td>
                        )}
                        <Table.Td>
                          <Group gap={4} justify="flex-end" wrap="nowrap">
                            <Tooltip label={tr("common.delete")} withinPortal>
                              <ActionIcon
                                aria-label={tr(
                                  "master.approvalSettings.deleteTheDelegation",
                                )}
                                color="red"
                                onClick={() =>
                                  setRemoveDelegate({
                                    id: d.id,
                                    delegatorName: d.delegatorName,
                                    delegateName: d.delegateName,
                                  })
                                }
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

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

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
      <EditMemberPeriodModal
        groupId={record.id}
        onClose={() => setPeriodMember(null)}
        onDone={() => router.refresh()}
        opened={!!periodMember}
        target={periodMember}
      />
      <RemoveApprovalGroupMemberModal
        groupId={record.id}
        member={removeMember}
        onClose={() => setRemoveMember(null)}
        onDone={() => router.refresh()}
        opened={!!removeMember}
      />
      <AddApprovalDelegateModal
        groupId={record.id}
        memberOptions={record.members
          .filter((m) => isMemberEffective(m, now))
          .map((m) => ({
            value: m.userId,
            label: `${m.displayName}（${m.username}）`,
          }))}
        onClose={() => setAddDelegateOpen(false)}
        onDone={() => router.refresh()}
        opened={addDelegateOpen}
      />
      <RemoveApprovalDelegateModal
        delegate={removeDelegate}
        groupId={record.id}
        onClose={() => setRemoveDelegate(null)}
        onDone={() => router.refresh()}
        opened={!!removeDelegate}
      />
    </DetailShell>
  );
}
