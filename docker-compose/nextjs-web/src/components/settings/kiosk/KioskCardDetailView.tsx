"use client";

/**
 * KioskCardDetailView — QRカード詳細（SY08, /settings/kiosk-cards/[id]）。
 *
 * サマリ（割当・状態・PIN・有効期間）+ 操作（割当・印刷・停止/再開・
 * PIN 管理・取り消し）+ 有効期間の編集（テンポラリカード — 期間外は
 * キオスクでログイン不可）+ 最近のログイン履歴。
 */

import {
  Alert,
  Badge,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
  IconCalendar,
  IconClockExclamation,
  IconHistory,
  IconPrinter,
} from "@tabler/icons-react";
import { useState, useTransition } from "react";
import {
  assignCard,
  resetPin,
  resumeCard,
  revokeCard,
  suspendCard,
  unlockPin,
  updateCardValidity,
} from "@/app/(dashboard)/settings/kiosk-cards/actions";
import {
  DangerButton,
  EditButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { ConfirmModal, ModalShell } from "@/components/ui/modals";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/format";
import type {
  KioskCardDetail,
  KioskCardSessionRow,
  KioskUserOption,
} from "@/lib/kiosk-admin";
import type { ActionResult } from "@/lib/server-action";
import {
  formatValidityRange,
  maskCardId,
  openPrintSheet,
  resolveCardValidity,
  ValidityBadge,
} from "./KioskCardsTable";

/** DatePickerInput の値（YYYY-MM-DD）→ ブラウザ TZ の日境界 ISO 文字列。 */
function dayStartIso(date: string | null): string | null {
  return date ? new Date(`${date}T00:00:00`).toISOString() : null;
}
function dayEndIso(date: string | null): string | null {
  return date ? new Date(`${date}T23:59:59.999`).toISOString() : null;
}

/** ISO 日時 → DatePickerInput の値（ブラウザ TZ の YYYY-MM-DD）。 */
function isoToDateValue(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function KioskCardDetailView({
  card,
  sessions,
  userOptions,
}: {
  card: KioskCardDetail;
  sessions: KioskCardSessionRow[];
  userOptions: KioskUserOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const now = Date.now();
  const validity = resolveCardValidity(now, card);

  // 割当モーダル（任意で有効期間も同時設定 = テンポラリカード）
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState<string | null>(null);
  const [assignFrom, setAssignFrom] = useState<string | null>(null);
  const [assignUntil, setAssignUntil] = useState<string | null>(null);

  // 有効期間の編集モーダル
  const [validityOpen, setValidityOpen] = useState(false);
  const [editFrom, setEditFrom] = useState<string | null>(null);
  const [editUntil, setEditUntil] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    run: () => Promise<ActionResult>;
  } | null>(null);

  const run = (action: () => Promise<ActionResult>, successMessage: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: "完了",
          message: successMessage,
          color: "green",
        });
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const handleAssign = () => {
    if (!assignUserId) {
      notifications.show({
        title: "エラー",
        message: "割当先ユーザーを選択してください",
        color: "red",
      });
      return;
    }
    const userId = assignUserId;
    const validityInput =
      assignFrom || assignUntil
        ? {
            validFrom: dayStartIso(assignFrom),
            validUntil: dayEndIso(assignUntil),
          }
        : undefined;
    startTransition(async () => {
      const result = await assignCard({
        cardId: card.id,
        userId,
        validity: validityInput,
      });
      if (result.ok) {
        setAssignOpen(false);
        notifications.show({
          title: "割当しました",
          message: "カードをユーザーに割り当てました",
          color: "green",
        });
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const openValidityModal = () => {
    setEditFrom(isoToDateValue(card.validFrom));
    setEditUntil(isoToDateValue(card.validUntil));
    setValidityOpen(true);
  };

  const handleValiditySave = () => {
    startTransition(async () => {
      const result = await updateCardValidity({
        cardId: card.id,
        validity: {
          validFrom: dayStartIso(editFrom),
          validUntil: dayEndIso(editUntil),
        },
      });
      if (result.ok) {
        setValidityOpen(false);
        notifications.show({
          title: "保存しました",
          message: "有効期間を更新しました",
          color: "green",
        });
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
    <Stack gap="md">
      <PageHeader
        actions={
          <SecondaryButton href="/settings/kiosk-cards">
            一覧へ戻る
          </SecondaryButton>
        }
        breadcrumbs={["システム", "QRカード管理", "カード詳細"]}
        status={
          <Group gap={4} wrap="nowrap">
            <StatusBadge entity="KioskCard" status={card.status} />
            <ValidityBadge validity={validity} />
          </Group>
        }
        title={maskCardId(card.id)}
      />

      {/* 期間外の警告 */}
      {card.status === "ASSIGNED" && validity === "EXPIRED" && (
        <Alert
          color="red"
          icon={<IconClockExclamation size={16} />}
          variant="light"
        >
          このカードは有効期間を過ぎているため、キオスクでログインできません。
          期間を延長するか、カードを取り消してください。
        </Alert>
      )}
      {card.status === "ASSIGNED" && validity === "NOT_YET" && (
        <Alert
          color="yellow"
          icon={<IconClockExclamation size={16} />}
          variant="light"
        >
          このカードは有効期間の開始前のため、まだキオスクでログインできません。
        </Alert>
      )}

      {/* サマリ */}
      <Paper p="md" radius="md" withBorder>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <FieldValue
            label="割当ユーザー"
            value={
              card.userDisplayName ? (
                <Group gap={6} wrap="nowrap">
                  <Text fw={500} size="sm">
                    {card.userDisplayName}
                  </Text>
                  {card.userUsername && (
                    <Text c="dimmed" ff="mono" size="xs">
                      {card.userUsername}
                    </Text>
                  )}
                </Group>
              ) : (
                "未割当"
              )
            }
          />
          <FieldValue
            label="有効期間"
            value={
              <Group gap={6} wrap="nowrap">
                <Text fw={500} size="sm">
                  {formatValidityRange(card)}
                </Text>
                <ValidityBadge validity={validity} />
              </Group>
            }
          />
          <FieldValue
            label="PIN"
            value={
              <Group gap={4} wrap="nowrap">
                <Badge color={card.pinSet ? "blue" : "gray"} variant="light">
                  {card.pinSet ? "設定済" : "未設定"}
                </Badge>
                {card.pinLocked && (
                  <Badge color="red" variant="light">
                    ロック中
                  </Badge>
                )}
              </Group>
            }
          />
          <FieldValue
            label="最終使用"
            value={card.lastUsedAt ? formatDateTime(card.lastUsedAt) : "—"}
          />
          <FieldValue label="使用回数" value={`${card.useCount} 回`} />
          <FieldValue
            label="PIN 最終確認"
            value={
              card.pinLastVerifiedAt
                ? formatDateTime(card.pinLastVerifiedAt)
                : "—"
            }
          />
          <FieldValue
            label="割当"
            value={
              card.assignedAt
                ? `${formatDateTime(card.assignedAt)}${
                    card.assignedByName ? `（${card.assignedByName}）` : ""
                  }`
                : "—"
            }
          />
          {card.revokedAt && (
            <FieldValue
              label="取り消し"
              value={`${formatDateTime(card.revokedAt)}${
                card.revokedByName ? `（${card.revokedByName}）` : ""
              }`}
            />
          )}
          <FieldValue
            label="発行日時"
            value={card.createdAt ? formatDateTime(card.createdAt) : "—"}
          />
        </SimpleGrid>
      </Paper>

      {/* 操作 */}
      {card.status !== "REVOKED" && (
        <Paper p="md" radius="md" withBorder>
          <Title mb="sm" order={5}>
            操作
          </Title>
          <Group gap="xs" wrap="wrap">
            {card.status === "UNASSIGNED" && (
              <PrimaryButton
                loading={isPending}
                onClick={() => {
                  setAssignUserId(null);
                  setAssignFrom(null);
                  setAssignUntil(null);
                  setAssignOpen(true);
                }}
              >
                ユーザーに割当
              </PrimaryButton>
            )}
            <EditButton loading={isPending} onClick={openValidityModal}>
              有効期間を編集
            </EditButton>
            <SecondaryButton
              leftSection={<IconPrinter size={14} />}
              onClick={() => openPrintSheet([card.id])}
            >
              印刷
            </SecondaryButton>
            {card.status === "ASSIGNED" && (
              <SecondaryButton
                loading={isPending}
                onClick={() =>
                  setConfirm({
                    title: "一時停止の確認",
                    message: "このカードでのログインを一時停止します。",
                    confirmLabel: "一時停止",
                    run: () => suspendCard(card.id),
                  })
                }
              >
                一時停止
              </SecondaryButton>
            )}
            {card.status === "SUSPENDED" && (
              <SecondaryButton
                loading={isPending}
                onClick={() =>
                  run(() => resumeCard(card.id), "カードを再開しました")
                }
              >
                再開
              </SecondaryButton>
            )}
            {card.pinLocked && (
              <SecondaryButton
                loading={isPending}
                onClick={() =>
                  run(() => unlockPin(card.id), "PIN ロックを解除しました")
                }
              >
                PINロック解除
              </SecondaryButton>
            )}
            {card.pinSet && (
              <SecondaryButton
                loading={isPending}
                onClick={() =>
                  setConfirm({
                    title: "PINリセットの確認",
                    message:
                      "PIN を消去します。次回ログイン時に PIN の再設定が必要になります。",
                    confirmLabel: "リセット",
                    run: () => resetPin(card.id),
                  })
                }
              >
                PINリセット
              </SecondaryButton>
            )}
            <DangerButton
              loading={isPending}
              onClick={() =>
                setConfirm({
                  title: "取り消しの確認",
                  message:
                    "カードを取り消します。この操作は取り消せません。オープン中のセッションも失効します。",
                  confirmLabel: "取り消し",
                  run: () => revokeCard(card.id),
                })
              }
            >
              取り消し
            </DangerButton>
          </Group>
        </Paper>
      )}

      {/* 最近のログイン */}
      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          最近のログイン
        </Title>
        {sessions.length === 0 ? (
          <EmptyState
            icon={<IconHistory size={28} />}
            message="このカードでのログインはまだありません"
          />
        ) : (
          <Table.ScrollContainer minWidth={480}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>端末</Table.Th>
                  <Table.Th>工場</Table.Th>
                  <Table.Th>ログイン</Table.Th>
                  <Table.Th>最終アクティビティ</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sessions.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td>{s.deviceName ?? "（名称未設定）"}</Table.Td>
                    <Table.Td>{s.factoryLabel ?? "—"}</Table.Td>
                    <Table.Td>{formatDateTime(s.createdAt)}</Table.Td>
                    <Table.Td>{formatDateTime(s.lastActivityAt)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      {/* 割当モーダル（任意で有効期間 = テンポラリカード） */}
      <ModalShell
        confirmLabel="割当"
        loading={isPending}
        onClose={() => setAssignOpen(false)}
        onConfirm={handleAssign}
        opened={assignOpen}
        size="sm"
        title="カードの割当"
      >
        <Stack gap="xs">
          <Text ff="mono" size="sm">
            {maskCardId(card.id)}
          </Text>
          <Select
            data={userOptions}
            label="割当先ユーザー"
            onChange={setAssignUserId}
            placeholder="ユーザーを選択"
            searchable
            value={assignUserId}
            withAsterisk
          />
          <Group grow>
            <DatePickerInput
              clearable
              label="有効開始日"
              leftSection={<IconCalendar size={14} />}
              onChange={setAssignFrom}
              placeholder="空欄で即時有効"
              value={assignFrom}
              valueFormat="YYYY/MM/DD"
            />
            <DatePickerInput
              clearable
              label="有効終了日"
              leftSection={<IconCalendar size={14} />}
              onChange={setAssignUntil}
              placeholder="空欄で無期限"
              value={assignUntil}
              valueFormat="YYYY/MM/DD"
            />
          </Group>
          <Text c="dimmed" size="xs">
            期間を設定するとテンポラリカードになり、期間外はログインできません
            （終了日はその日いっぱい有効）。1 ユーザーに割当できるカードは 1
            枚です。
          </Text>
        </Stack>
      </ModalShell>

      {/* 有効期間の編集モーダル */}
      <ModalShell
        confirmLabel="保存"
        loading={isPending}
        onClose={() => setValidityOpen(false)}
        onConfirm={handleValiditySave}
        opened={validityOpen}
        size="sm"
        title="有効期間の編集"
      >
        <Stack gap="xs">
          <Group grow>
            <DatePickerInput
              clearable
              label="有効開始日"
              leftSection={<IconCalendar size={14} />}
              onChange={setEditFrom}
              placeholder="空欄で即時有効"
              value={editFrom}
              valueFormat="YYYY/MM/DD"
            />
            <DatePickerInput
              clearable
              label="有効終了日"
              leftSection={<IconCalendar size={14} />}
              onChange={setEditUntil}
              placeholder="空欄で無期限"
              value={editUntil}
              valueFormat="YYYY/MM/DD"
            />
          </Group>
          <Text c="dimmed" size="xs">
            期間外のカードはキオスクでログインできません（終了日はその日
            いっぱい有効）。両方空欄で無期限に戻ります。ログイン中の
            セッションは最長 8 時間で自然失効します。
          </Text>
        </Stack>
      </ModalShell>

      {/* 破壊的操作の確認 */}
      <ConfirmModal
        confirmLabel={confirm?.confirmLabel ?? "実行"}
        loading={isPending}
        message={confirm?.message ?? ""}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) {
            run(confirm.run, "操作が完了しました");
            setConfirm(null);
          }
        }}
        opened={confirm != null}
        title={confirm?.title ?? ""}
      />
    </Stack>
  );
}
