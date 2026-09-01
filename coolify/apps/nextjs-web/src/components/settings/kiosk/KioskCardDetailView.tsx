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
import { useTranslations } from "next-intl";
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
  const tr = useTranslations();
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
          title: tr("common.completed"),
          message: successMessage,
          color: "green",
        });
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const handleAssign = () => {
    if (!assignUserId) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("common.selectTheUserToAssignIt"),
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
          title: tr("common.assigned"),
          message: tr("common.theCardWasAssignedToThe"),
          color: "green",
        });
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const handleLimitSave = () => {
    const limit = typeof editLimit === "number" ? editLimit : Number(editLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("settings.kiosk.setTheConcurrentLoginLimitBetween"),
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
          title: tr("common.saved2"),
          message: tr("settings.kiosk.theConcurrentLoginLimitWasUpdated"),
          color: "green",
        });
      } else {
        notifications.show({
          title: tr("common.error2"),
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
          title: tr("common.saved2"),
          message: tr("settings.kiosk.theValidPeriodWasUpdated"),
          color: "green",
        });
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
    <Stack gap="md">
      <PageHeader
        actions={
          <SecondaryButton href="/settings/kiosk-cards">
            {tr("common.backToTheList")}
          </SecondaryButton>
        }
        breadcrumbs={[
          tr("common.system"),
          tr("common.qRCards"),
          tr("settings.kiosk.cardDetails"),
        ]}
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
          {tr("settings.kiosk.thisCardIsPastItsValid")}
        </Alert>
      )}
      {card.status === "ASSIGNED" && validity === "NOT_YET" && (
        <Alert
          color="yellow"
          icon={<IconClockExclamation size={16} />}
          variant="light"
        >
          {tr("settings.kiosk.thisCardSValidPeriodHas")}
        </Alert>
      )}

      {/* サマリ */}
      <Paper p="md" radius="md" withBorder>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <FieldValue
            label={tr("common.assignedUser")}
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
                tr("common.unassigned")
              )
            }
          />
          <FieldValue
            label={tr("common.validPeriod")}
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
                  {card.pinSet ? "設定済" : tr("common.notSet2")}
                </Badge>
                {card.pinLocked && (
                  <Badge color="red" variant="light">
                    {tr("common.locked")}
                  </Badge>
                )}
              </Group>
            }
          />
          <FieldValue
            label={tr("settings.kiosk.concurrentLoginLimit")}
            value={`${card.maxActiveSessions} 台`}
          />
          <FieldValue
            label={tr("common.lastUsed")}
            value={card.lastUsedAt ? fmt.dateTime(card.lastUsedAt) : "—"}
          />
          <FieldValue
            label={tr("common.timesUsed")}
            value={`${card.useCount} 回`}
          />
          <FieldValue
            label={tr("settings.kiosk.pINLastVerified")}
            value={
              card.pinLastVerifiedAt
                ? fmt.dateTime(card.pinLastVerifiedAt)
                : "—"
            }
          />
          <FieldValue
            label={tr("common.allocation")}
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
              label={tr("common.revoked2")}
              value={`${fmt.dateTime(card.revokedAt)}${
                card.revokedByName ? `（${card.revokedByName}）` : ""
              }`}
            />
          )}
          <FieldValue
            label={tr("settings.kiosk.issuedAt")}
            value={card.createdAt ? fmt.dateTime(card.createdAt) : "—"}
          />
        </SimpleGrid>
      </Paper>

      {/* 操作 */}
      {card.status !== "REVOKED" && (
        <Paper p="md" radius="md" withBorder>
          <Title mb="sm" order={5}>
            {tr("common.actions")}
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
                {tr("common.assignToAUser")}
              </PrimaryButton>
            )}
            <EditButton loading={isPending} onClick={openValidityModal}>
              {tr("settings.kiosk.editTheValidPeriod")}
            </EditButton>
            <SecondaryButton
              loading={isPending}
              onClick={() => {
                setEditLimit(card.maxActiveSessions);
                setLimitOpen(true);
              }}
            >
              {tr("settings.kiosk.concurrentLoginLimit")}
            </SecondaryButton>
            <SecondaryButton
              leftSection={<IconPrinter size={14} />}
              onClick={() => openPrintSheet([card.id])}
            >
              {tr("common.print2")}
            </SecondaryButton>
            {card.status === "ASSIGNED" && (
              <SecondaryButton
                loading={isPending}
                onClick={() =>
                  setConfirm({
                    title: tr("common.confirmSuspension"),
                    message: tr("common.loginsWithThisCardWillBe"),
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
                  run(() => resumeCard(card.id), tr("common.theCardWasResumed"))
                }
              >
                {tr("common.resume")}
              </SecondaryButton>
            )}
            {card.pinLocked && (
              <SecondaryButton
                loading={isPending}
                onClick={() =>
                  run(
                    () => unlockPin(card.id),
                    tr("common.thePinLockWasReleased"),
                  )
                }
              >
                {tr("common.unlockThePin")}
              </SecondaryButton>
            )}
            {card.pinSet && (
              <SecondaryButton
                loading={isPending}
                onClick={() =>
                  setConfirm({
                    title: tr("common.confirmResettingThePin"),
                    message: tr("common.clearsThePinItWillHave"),
                    confirmLabel: tr("common.reset2"),
                    run: () => resetPin(card.id),
                  })
                }
              >
                {tr("common.resetThePin")}
              </SecondaryButton>
            )}
            <DangerButton
              loading={isPending}
              onClick={() =>
                setConfirm({
                  title: tr("common.confirmRevocation"),
                  message: tr("common.theCardWillBeRevokedThis"),
                  confirmLabel: tr("common.revoked2"),
                  run: () => revokeCard(card.id),
                })
              }
            >
              {tr("common.revoked2")}
            </DangerButton>
          </Group>
        </Paper>
      )}

      {/* 最近のログイン */}
      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          {tr("settings.kiosk.recentLogins")}
        </Title>
        {sessions.length === 0 ? (
          <EmptyState
            icon={<IconHistory size={28} />}
            message={tr("settings.kiosk.thereHaveBeenNoLoginsWith")}
          />
        ) : (
          <Table.ScrollContainer minWidth={480}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("common.device")}</Table.Th>
                  <Table.Th>拠点</Table.Th>
                  <Table.Th>{tr("common.logIn")}</Table.Th>
                  <Table.Th>{tr("common.lastActivity")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sessions.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td>{s.deviceName ?? tr("common.unnamed")}</Table.Td>
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
        confirmLabel={tr("common.allocation")}
        loading={isPending}
        onClose={() => setAssignOpen(false)}
        onConfirm={handleAssign}
        opened={assignOpen}
        size="sm"
        title={tr("common.cardAssignment")}
      >
        <Stack gap="xs">
          <Text ff="mono" size="sm">
            {maskCardId(card.id)}
          </Text>
          <Select
            data={userOptions}
            label={tr("settings.kiosk.assignedUser")}
            onChange={setAssignUserId}
            placeholder={tr("common.selectAUser")}
            searchable
            value={assignUserId}
            withAsterisk
          />
          <Group grow>
            <DatePickerInput
              clearable
              label={tr("common.validFrom")}
              leftSection={<IconCalendar size={14} />}
              onChange={setAssignFrom}
              placeholder={tr(
                "settings.kiosk.leaveBlankToTakeEffectImmediately",
              )}
              value={assignFrom}
              valueFormat="YYYY/MM/DD"
            />
            <DatePickerInput
              clearable
              label={tr("common.validUntil")}
              leftSection={<IconCalendar size={14} />}
              onChange={setAssignUntil}
              placeholder={tr("common.leaveBlankForNoEndDate")}
              value={assignUntil}
              valueFormat="YYYY/MM/DD"
            />
          </Group>
          <Text c="dimmed" size="xs">
            {tr("settings.kiosk.settingAPeriodMakesItA")}
          </Text>
        </Stack>
      </ModalShell>

      {/* 有効期間の編集モーダル */}
      <ModalShell
        confirmLabel={tr("common.save2")}
        loading={isPending}
        onClose={() => setValidityOpen(false)}
        onConfirm={handleValiditySave}
        opened={validityOpen}
        size="sm"
        title={tr("settings.kiosk.editTheValidPeriod2")}
      >
        <Stack gap="xs">
          <Group grow>
            <DatePickerInput
              clearable
              label={tr("common.validFrom")}
              leftSection={<IconCalendar size={14} />}
              onChange={setEditFrom}
              placeholder={tr(
                "settings.kiosk.leaveBlankToTakeEffectImmediately",
              )}
              value={editFrom}
              valueFormat="YYYY/MM/DD"
            />
            <DatePickerInput
              clearable
              label={tr("common.validUntil")}
              leftSection={<IconCalendar size={14} />}
              onChange={setEditUntil}
              placeholder={tr("common.leaveBlankForNoEndDate")}
              value={editUntil}
              valueFormat="YYYY/MM/DD"
            />
          </Group>
          <Text c="dimmed" size="xs">
            {tr("settings.kiosk.aCardOutsideItsPeriodCannot")}
          </Text>
        </Stack>
      </ModalShell>

      {/* 同時ログイン上限の編集モーダル */}
      <ModalShell
        confirmLabel={tr("common.save2")}
        loading={isPending}
        onClose={() => setLimitOpen(false)}
        onConfirm={handleLimitSave}
        opened={limitOpen}
        size="sm"
        title={tr("settings.kiosk.concurrentLoginLimit")}
      >
        <Stack gap="xs">
          <NumberInput
            allowDecimal={false}
            label={tr("settings.kiosk.howManyDevicesCanBeLogged")}
            max={10}
            min={1}
            onChange={setEditLimit}
            value={editLimit}
            withAsterisk
          />
          <Text c="dimmed" size="xs">
            {tr("settings.kiosk.loggingInBeyondTheLimitLogs")}
          </Text>
        </Stack>
      </ModalShell>

      {/* 破壊的操作の確認 */}
      <ConfirmModal
        confirmLabel={confirm?.confirmLabel ?? tr("common.run2")}
        loading={isPending}
        message={confirm?.message ?? ""}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) {
            run(confirm.run, tr("common.done"));
            setConfirm(null);
          }
        }}
        opened={confirm != null}
        title={confirm?.title ?? ""}
      />
    </Stack>
  );
}
