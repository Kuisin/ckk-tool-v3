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
  NumberInput,
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
  updateCardSessionLimit,
  updateCardValidity,
} from "@/app/(dashboard)/settings/kiosk-cards/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
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
import { useTr } from "@/hooks/useTr";
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
  const tr = useTr();
  const fmt = useFormat();
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

  // 同時ログイン上限の編集モーダル
  const [limitOpen, setLimitOpen] = useState(false);
  const [editLimit, setEditLimit] = useState<number | string>(
    card.maxActiveSessions,
  );

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
          title: tr("完了"),
          message: successMessage,
          color: "green",
        });
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
          color: "red",
        });
      }
    });
  };

  const handleAssign = () => {
    if (!assignUserId) {
      notifications.show({
        title: tr("エラー"),
        message: tr("割当先ユーザーを選択してください"),
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
          title: tr("割当しました"),
          message: tr("カードをユーザーに割り当てました"),
          color: "green",
        });
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
          color: "red",
        });
      }
    });
  };

  const handleLimitSave = () => {
    const limit = typeof editLimit === "number" ? editLimit : Number(editLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
      notifications.show({
        title: tr("エラー"),
        message: tr("同時ログイン上限は 1〜10 で指定してください"),
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const result = await updateCardSessionLimit({
        cardId: card.id,
        maxActiveSessions: limit,
      });
      if (result.ok) {
        setLimitOpen(false);
        notifications.show({
          title: tr("保存しました"),
          message: tr("同時ログイン上限を更新しました"),
          color: "green",
        });
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
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
          title: tr("保存しました"),
          message: tr("有効期間を更新しました"),
          color: "green",
        });
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
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
            {tr("一覧へ戻る")}
          </SecondaryButton>
        }
        breadcrumbs={[tr("システム"), tr("QRカード管理"), tr("カード詳細")]}
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
          {tr(
            tr(
              tr(
                "このカードは有効期間を過ぎているため、キオスクでログインできません。\n          期間を延長するか、カードを取り消してください。",
              ),
            ),
          )}
        </Alert>
      )}
      {card.status === "ASSIGNED" && validity === "NOT_YET" && (
        <Alert
          color="yellow"
          icon={<IconClockExclamation size={16} />}
          variant="light"
        >
          {tr(
            tr(
              tr(
                "このカードは有効期間の開始前のため、まだキオスクでログインできません。",
              ),
            ),
          )}
        </Alert>
      )}

      {/* サマリ */}
      <Paper p="md" radius="md" withBorder>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <FieldValue
            label={tr("割当ユーザー")}
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
                tr("未割当")
              )
            }
          />
          <FieldValue
            label={tr("有効期間")}
            value={
              <Group gap={6} wrap="nowrap">
                <Text fw={500} size="sm">
                  {formatValidityRange(fmt, card)}
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
                  {card.pinSet ? "設定済" : tr("未設定")}
                </Badge>
                {card.pinLocked && (
                  <Badge color="red" variant="light">
                    {tr("ロック中")}
                  </Badge>
                )}
              </Group>
            }
          />
          <FieldValue
            label={tr("同時ログイン上限")}
            value={`${card.maxActiveSessions} 台`}
          />
          <FieldValue
            label={tr("最終使用")}
            value={card.lastUsedAt ? fmt.dateTime(card.lastUsedAt) : "—"}
          />
          <FieldValue label={tr("使用回数")} value={`${card.useCount} 回`} />
          <FieldValue
            label={tr("PIN 最終確認")}
            value={
              card.pinLastVerifiedAt
                ? fmt.dateTime(card.pinLastVerifiedAt)
                : "—"
            }
          />
          <FieldValue
            label={tr("割当")}
            value={
              card.assignedAt
                ? `${fmt.dateTime(card.assignedAt)}${
                    card.assignedByName ? `（${card.assignedByName}）` : ""
                  }`
                : "—"
            }
          />
          {card.revokedAt && (
            <FieldValue
              label={tr("取り消し")}
              value={`${fmt.dateTime(card.revokedAt)}${
                card.revokedByName ? `（${card.revokedByName}）` : ""
              }`}
            />
          )}
          <FieldValue
            label={tr("発行日時")}
            value={card.createdAt ? fmt.dateTime(card.createdAt) : "—"}
          />
        </SimpleGrid>
      </Paper>

      {/* 操作 */}
      {card.status !== "REVOKED" && (
        <Paper p="md" radius="md" withBorder>
          <Title mb="sm" order={5}>
            {tr("操作")}
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
                {tr("ユーザーに割当")}
              </PrimaryButton>
            )}
            <EditButton loading={isPending} onClick={openValidityModal}>
              {tr("有効期間を編集")}
            </EditButton>
            <SecondaryButton
              loading={isPending}
              onClick={() => {
                setEditLimit(card.maxActiveSessions);
                setLimitOpen(true);
              }}
            >
              {tr("同時ログイン上限")}
            </SecondaryButton>
            <SecondaryButton
              leftSection={<IconPrinter size={14} />}
              onClick={() => openPrintSheet([card.id])}
            >
              {tr("印刷")}
            </SecondaryButton>
            {card.status === "ASSIGNED" && (
              <SecondaryButton
                loading={isPending}
                onClick={() =>
                  setConfirm({
                    title: tr("一時停止の確認"),
                    message: tr("このカードでのログインを一時停止します。"),
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
                  run(() => resumeCard(card.id), tr("カードを再開しました"))
                }
              >
                {tr("再開")}
              </SecondaryButton>
            )}
            {card.pinLocked && (
              <SecondaryButton
                loading={isPending}
                onClick={() =>
                  run(() => unlockPin(card.id), tr("PIN ロックを解除しました"))
                }
              >
                {tr("PINロック解除")}
              </SecondaryButton>
            )}
            {card.pinSet && (
              <SecondaryButton
                loading={isPending}
                onClick={() =>
                  setConfirm({
                    title: tr("PINリセットの確認"),
                    message: tr(
                      tr(
                        tr(
                          "PIN を消去します。次回ログイン時に PIN の再設定が必要になります。",
                        ),
                      ),
                    ),
                    confirmLabel: tr("リセット"),
                    run: () => resetPin(card.id),
                  })
                }
              >
                {tr("PINリセット")}
              </SecondaryButton>
            )}
            <DangerButton
              loading={isPending}
              onClick={() =>
                setConfirm({
                  title: tr("取り消しの確認"),
                  message: tr(
                    tr(
                      tr(
                        "カードを取り消します。この操作は取り消せません。オープン中のセッションも失効します。",
                      ),
                    ),
                  ),
                  confirmLabel: tr("取り消し"),
                  run: () => revokeCard(card.id),
                })
              }
            >
              {tr("取り消し")}
            </DangerButton>
          </Group>
        </Paper>
      )}

      {/* 最近のログイン */}
      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          {tr("最近のログイン")}
        </Title>
        {sessions.length === 0 ? (
          <EmptyState
            icon={<IconHistory size={28} />}
            message={tr("このカードでのログインはまだありません")}
          />
        ) : (
          <Table.ScrollContainer minWidth={480}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("端末")}</Table.Th>
                  <Table.Th>拠点</Table.Th>
                  <Table.Th>{tr("ログイン")}</Table.Th>
                  <Table.Th>{tr("最終アクティビティ")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sessions.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td>{s.deviceName ?? tr("（名称未設定）")}</Table.Td>
                    <Table.Td>{s.plantLabel ?? "—"}</Table.Td>
                    <Table.Td>{fmt.dateTime(s.createdAt)}</Table.Td>
                    <Table.Td>{fmt.dateTime(s.lastActivityAt)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      {/* 割当モーダル（任意で有効期間 = テンポラリカード） */}
      <ModalShell
        confirmLabel={tr("割当")}
        loading={isPending}
        onClose={() => setAssignOpen(false)}
        onConfirm={handleAssign}
        opened={assignOpen}
        size="sm"
        title={tr("カードの割当")}
      >
        <Stack gap="xs">
          <Text ff="mono" size="sm">
            {maskCardId(card.id)}
          </Text>
          <Select
            data={userOptions}
            label={tr("割当先ユーザー")}
            onChange={setAssignUserId}
            placeholder={tr("ユーザーを選択")}
            searchable
            value={assignUserId}
            withAsterisk
          />
          <Group grow>
            <DatePickerInput
              clearable
              label={tr("有効開始日")}
              leftSection={<IconCalendar size={14} />}
              onChange={setAssignFrom}
              placeholder={tr("空欄で即時有効")}
              value={assignFrom}
              valueFormat="YYYY/MM/DD"
            />
            <DatePickerInput
              clearable
              label={tr("有効終了日")}
              leftSection={<IconCalendar size={14} />}
              onChange={setAssignUntil}
              placeholder={tr("空欄で無期限")}
              value={assignUntil}
              valueFormat="YYYY/MM/DD"
            />
          </Group>
          <Text c="dimmed" size="xs">
            {tr(
              tr(
                tr(
                  "期間を設定するとテンポラリカードになり、期間外はログインできません\n            （終了日はその日いっぱい有効）。1 ユーザーに割当できるカードは 1\n            枚です。",
                ),
              ),
            )}
          </Text>
        </Stack>
      </ModalShell>

      {/* 有効期間の編集モーダル */}
      <ModalShell
        confirmLabel={tr("保存")}
        loading={isPending}
        onClose={() => setValidityOpen(false)}
        onConfirm={handleValiditySave}
        opened={validityOpen}
        size="sm"
        title={tr("有効期間の編集")}
      >
        <Stack gap="xs">
          <Group grow>
            <DatePickerInput
              clearable
              label={tr("有効開始日")}
              leftSection={<IconCalendar size={14} />}
              onChange={setEditFrom}
              placeholder={tr("空欄で即時有効")}
              value={editFrom}
              valueFormat="YYYY/MM/DD"
            />
            <DatePickerInput
              clearable
              label={tr("有効終了日")}
              leftSection={<IconCalendar size={14} />}
              onChange={setEditUntil}
              placeholder={tr("空欄で無期限")}
              value={editUntil}
              valueFormat="YYYY/MM/DD"
            />
          </Group>
          <Text c="dimmed" size="xs">
            {tr(
              tr(
                tr(
                  "期間外のカードはキオスクでログインできません（終了日はその日\n            いっぱい有効）。両方空欄で無期限に戻ります。ログイン中の\n            セッションは最長 8 時間で自然失効します。",
                ),
              ),
            )}
          </Text>
        </Stack>
      </ModalShell>

      {/* 同時ログイン上限の編集モーダル */}
      <ModalShell
        confirmLabel={tr("保存")}
        loading={isPending}
        onClose={() => setLimitOpen(false)}
        onConfirm={handleLimitSave}
        opened={limitOpen}
        size="sm"
        title={tr("同時ログイン上限")}
      >
        <Stack gap="xs">
          <NumberInput
            allowDecimal={false}
            label={tr("同時にログインできる端末数")}
            max={10}
            min={1}
            onChange={setEditLimit}
            value={editLimit}
            withAsterisk
          />
          <Text c="dimmed" size="xs">
            {tr(
              tr(
                tr(
                  "上限を超えてログインすると、最も古い端末のセッションから自動的に\n            ログアウトされます。上限を下げても既存のセッションは即時には\n            失効しません（次のログイン時に整理されます）。",
                ),
              ),
            )}
          </Text>
        </Stack>
      </ModalShell>

      {/* 破壊的操作の確認 */}
      <ConfirmModal
        confirmLabel={confirm?.confirmLabel ?? tr("実行")}
        loading={isPending}
        message={confirm?.message ?? ""}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) {
            run(confirm.run, tr("操作が完了しました"));
            setConfirm(null);
          }
        }}
        opened={confirm != null}
        title={confirm?.title ?? ""}
      />
    </Stack>
  );
}
