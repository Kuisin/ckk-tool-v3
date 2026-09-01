"use client";

/**
 * KioskCardsTable — QRカード管理（SY08, /settings/kiosk-cards）の一覧。
 *
 * キオスクログイン用 QR カードの発行・割当・停止・取り消し・PIN 管理。
 * カード ID は前半をマスクし末尾 8 文字のみ表示（フル ID は印刷シートでのみ
 * QR 化される）。選択 → 印刷で印刷ページ（/settings/kiosk-cards/print —
 * A4 名刺用紙 10 面・原寸 91×55mm・十字トンボ）を新規タブに開く。
 */

import {
  Badge,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPrinter, IconQrcode, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  assignCard,
  issueCards,
  resetPin,
  resumeCard,
  revokeCard,
  suspendCard,
  unlockPin,
} from "@/app/(dashboard)/settings/kiosk-cards/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { CreateButton } from "@/components/ui/buttons";
import {
  type Column,
  DataTable,
  type RowAction,
} from "@/components/ui/DataTable";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { ConfirmModal, ModalShell } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { formatCode } from "@/lib/crockford";
import { fieldHelp } from "@/lib/field-help";
import type { Formatters } from "@/lib/format";
import type { KioskCardRow, KioskUserOption } from "@/lib/kiosk-admin";
import { openInNewContext } from "@/lib/pwa-display";
import type { ActionResult } from "@/lib/server-action";
import { statusOptions } from "@/lib/status-map";

const PRINT_PATH = "/settings/kiosk-cards/print";

/** カード ID の表示: 前半 8 文字をマスクし末尾 8 文字のみ見せる。 */
export function maskCardId(id: string): string {
  return `****-****-${formatCode(id.slice(8))}`;
}

/**
 * 印刷シートを新規タブで開く（そこからブラウザ印刷 / PDF 保存）。
 *
 * PDF ではなく HTML の印刷ページを開くのは原寸のため — CSS の
 * `@page { size: <length>{2} }` は絶対ページボックスで UA が縮小できない
 * のに対し、PDF はビューアの「印刷可能領域に合わせる」で縮んでしまう。
 *
 * 開き方は `openInNewContext`（`lib/pwa-display.ts`）に任せる — `window.open`
 * ではなく実アンカーをクリックし、PWA でも端末のアプリ内ブラウザ / 別ウィンドウ
 * で開く（アプリの中に置き換えると印刷シートから戻れない）。
 */
export function openPrintSheet(ids: string[]) {
  openInNewContext(`${PRINT_PATH}?ids=${encodeURIComponent(ids.join(","))}`);
}

// ── 有効期間（テンポラリカード） ─────────────────────────────────────────────

export type CardValidity = "PERMANENT" | "ACTIVE" | "NOT_YET" | "EXPIRED";

/** 有効期間の現在判定（無期限 / 有効 / 開始前 / 期限切れ）。 */
export function resolveCardValidity(
  now: number,
  r: Pick<KioskCardRow, "validFrom" | "validUntil">,
): CardValidity {
  if (!r.validFrom && !r.validUntil) return "PERMANENT";
  if (r.validFrom && now < new Date(r.validFrom).getTime()) return "NOT_YET";
  if (r.validUntil && now > new Date(r.validUntil).getTime()) return "EXPIRED";
  return "ACTIVE";
}

/** 有効期間の表示（日付形式はユーザーの表示設定。無期限は「無期限」）。 */
export function formatValidityRange(
  fmt: Formatters,
  r: Pick<KioskCardRow, "validFrom" | "validUntil">,
): string {
  if (!r.validFrom && !r.validUntil) return "無期限";
  const from = r.validFrom ? fmt.date(r.validFrom) : "";
  const until = r.validUntil ? fmt.date(r.validUntil) : "";
  return `${from} 〜 ${until}`;
}

/** 期間外のときだけ出す警告バッジ（期間内・無期限は何も出さない）。 */
export function ValidityBadge({ validity }: { validity: CardValidity }) {
  const tr = useTranslations();
  if (validity === "EXPIRED") {
    return (
      <Badge color="red" variant="light">
        {tr("common.expired")}
      </Badge>
    );
  }
  if (validity === "NOT_YET") {
    return (
      <Badge color="yellow" variant="light">
        {tr("settings.kiosk.beforeStart")}
      </Badge>
    );
  }
  return null;
}

export function KioskCardsTable({
  rows,
  userOptions,
}: {
  rows: KioskCardRow[];
  userOptions: KioskUserOption[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();
  const router = useRouter();
  const now = Date.now();

  const [search, setSearch] = useUrlStringState("q");
  const [status, setStatus] = useUrlSelectState("status");

  // モーダル状態
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueCount, setIssueCount] = useState<number | string>(10);
  const [assignTarget, setAssignTarget] = useState<KioskCardRow | null>(null);
  const [assignUserId, setAssignUserId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    run: () => Promise<ActionResult>;
  } | null>(null);

  const reset = () => {
    setSearch(null);
    setStatus(null);
  };

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      r.id.toLowerCase().includes(q) ||
      (r.userDisplayName ?? "").toLowerCase().includes(q) ||
      (r.userUsername ?? "").toLowerCase().includes(q);
    const matchesStatus = !status || r.status === status;
    return matchesSearch && matchesStatus;
  });

  /** Server Action 実行 → 通知（design.md §16.1）。 */
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

  const handleIssue = () => {
    const count = Number(issueCount);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("settings.kiosk.setTheNumberOfCardsBetween"),
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const result = await issueCards({ count });
      if (result.ok) {
        setIssueOpen(false);
        notifications.show({
          title: tr("common.issued"),
          message: `QRカードを ${result.data.ids.length} 枚発行しました`,
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
    if (!assignTarget || !assignUserId) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("common.selectTheUserToAssignIt"),
        color: "red",
      });
      return;
    }
    const cardId = assignTarget.id;
    const userId = assignUserId;
    startTransition(async () => {
      const result = await assignCard({ cardId, userId });
      if (result.ok) {
        setAssignTarget(null);
        setAssignUserId(null);
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

  const columns: Column<KioskCardRow>[] = [
    {
      key: "id",
      header: tr("settings.kiosk.cardId"),
      width: 200,
      sortable: true,
      render: (r) => (
        <Text ff="mono" size="sm">
          {maskCardId(r.id)}
        </Text>
      ),
      sortValue: (r) => r.id,
    },
    {
      key: "user",
      header: tr("common.assignedUser"),
      sortable: true,
      render: (r) =>
        r.userDisplayName ? (
          <Group gap={6} wrap="nowrap">
            <Text fw={500} size="sm" truncate>
              {r.userDisplayName}
            </Text>
            {r.userUsername && (
              <Text c="dimmed" ff="mono" size="xs">
                {r.userUsername}
              </Text>
            )}
          </Group>
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ),
      sortValue: (r) => r.userDisplayName ?? "",
    },
    {
      key: "status",
      header: tr("common.status"),
      width: 110,
      sortable: true,
      render: (r) => <StatusBadge entity="KioskCard" status={r.status} />,
      sortValue: (r) => r.status,
    },
    {
      key: "pin",
      header: "PIN",
      width: 130,
      render: (r) => (
        <Group gap={4} wrap="nowrap">
          <Badge color={r.pinSet ? "blue" : "gray"} variant="light">
            {r.pinSet ? "設定済" : tr("common.notSet2")}
          </Badge>
          {r.pinLocked && (
            <Badge color="red" variant="light">
              {tr("common.locked")}
            </Badge>
          )}
        </Group>
      ),
    },
    {
      key: "validity",
      header: tr("common.validPeriod"),
      width: 200,
      sortable: true,
      render: (r) => (
        <Group gap={4} wrap="nowrap">
          <Text
            c={r.validFrom || r.validUntil ? undefined : "dimmed"}
            size="sm"
          >
            {formatValidityRange(fmt, r)}
          </Text>
          <ValidityBadge validity={resolveCardValidity(now, r)} />
        </Group>
      ),
      sortValue: (r) => r.validUntil ?? "9999",
    },
    {
      key: "lastUsedAt",
      header: tr("common.lastUsed"),
      width: 150,
      sortable: true,
      render: (r) => (
        <Text c="dimmed" size="sm">
          {r.lastUsedAt ? fmt.dateTime(r.lastUsedAt) : "—"}
        </Text>
      ),
      sortValue: (r) => r.lastUsedAt ?? "",
    },
    {
      key: "useCount",
      header: tr("common.timesUsed"),
      width: 90,
      align: "right",
      sortable: true,
      render: (r) => (
        <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
          {r.useCount}
        </Text>
      ),
      sortValue: (r) => r.useCount,
    },
  ];

  const rowActions = (r: KioskCardRow): RowAction<KioskCardRow>[] => {
    const actions: RowAction<KioskCardRow>[] = [];
    if (r.status === "UNASSIGNED") {
      actions.push({
        label: tr("common.assignToAUser"),
        onAction: () => {
          setAssignTarget(r);
          setAssignUserId(null);
        },
      });
    }
    if (r.status !== "REVOKED") {
      actions.push({
        label: tr("common.print2"),
        icon: <IconPrinter size={14} />,
        onAction: () => openPrintSheet([r.id]),
      });
    }
    if (r.status === "ASSIGNED") {
      actions.push({
        label: "一時停止",
        color: "orange",
        onAction: () =>
          setConfirm({
            title: tr("common.confirmSuspension"),
            message: tr("common.loginsWithThisCardWillBe"),
            confirmLabel: "一時停止",
            run: () => suspendCard(r.id),
          }),
      });
    }
    if (r.status === "SUSPENDED") {
      actions.push({
        label: tr("common.resume"),
        onAction: () =>
          run(() => resumeCard(r.id), tr("common.theCardWasResumed")),
      });
    }
    if (r.pinLocked) {
      actions.push({
        label: tr("common.unlockThePin"),
        onAction: () =>
          run(() => unlockPin(r.id), tr("common.thePinLockWasReleased")),
      });
    }
    if (r.pinSet) {
      actions.push({
        label: tr("common.resetThePin"),
        onAction: () =>
          setConfirm({
            title: tr("common.confirmResettingThePin"),
            message: tr("common.clearsThePinItWillHave"),
            confirmLabel: tr("common.reset2"),
            run: () => resetPin(r.id),
          }),
      });
    }
    if (r.status !== "REVOKED") {
      actions.push({
        label: tr("common.revoked2"),
        color: "red",
        onAction: () =>
          setConfirm({
            title: tr("common.confirmRevocation"),
            message: tr("common.theCardWillBeRevokedThis"),
            confirmLabel: tr("common.revoked2"),
            run: () => revokeCard(r.id),
          }),
      });
    }
    return actions;
  };

  return (
    <ListShell
      action={
        <CreateButton
          loading={isPending}
          onClick={() => setIssueOpen(true)}
          style={{ flexShrink: 0 }}
        >
          {isMobile ? "発行" : tr("settings.kiosk.issueACard")}
        </CreateButton>
      }
      breadcrumbs={[tr("common.system"), tr("common.qRCards")]}
      filters={
        <Select
          clearable
          data={statusOptions("KioskCard")}
          onChange={setStatus}
          placeholder={tr("common.status")}
          style={isMobile ? { flex: 1 } : undefined}
          value={status}
          w={isMobile ? undefined : 140}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value || null)}
          placeholder={tr("settings.kiosk.cardIdUser")}
          value={search}
        />
      }
      title={tr("common.qRCards")}
    >
      <DataTable
        bulkActions={[
          {
            label: tr("settings.kiosk.printTheSelectedCards"),
            icon: <IconPrinter size={16} />,
            onAction: (selected) => openPrintSheet(selected.map((r) => r.id)),
          },
        ]}
        columns={columns}
        data={filtered}
        emptyIcon={<IconQrcode size={28} />}
        emptyMessage={tr("settings.kiosk.thereAreNoQrCards")}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/settings/kiosk-cards/${r.id}`)}
        renderCard={(r) => (
          <Stack gap={3} style={{ minWidth: 0 }}>
            <Text c="dimmed" ff="mono" size="xs">
              {maskCardId(r.id)}
            </Text>
            <Text fw={600} size="sm" truncate>
              {r.userDisplayName ?? tr("common.unassigned")}
            </Text>
            <Group gap={4} wrap="wrap">
              <StatusBadge entity="KioskCard" status={r.status} />
              <Badge color={r.pinSet ? "blue" : "gray"} variant="light">
                {r.pinSet ? "PIN設定済" : tr("settings.kiosk.noPinSet")}
              </Badge>
              {r.pinLocked && (
                <Badge color="red" variant="light">
                  {tr("common.locked")}
                </Badge>
              )}
              <ValidityBadge validity={resolveCardValidity(now, r)} />
            </Group>
            {(r.validFrom || r.validUntil) && (
              <Text c="dimmed" size="xs">
                有効期間 {formatValidityRange(fmt, r)}
              </Text>
            )}
            <Group gap="md" mt={2}>
              <Text c="dimmed" size="xs">
                最終使用 {r.lastUsedAt ? fmt.dateTime(r.lastUsedAt) : "—"}
              </Text>
              <Text c="dimmed" size="xs">
                {r.useCount} 回
              </Text>
            </Group>
          </Stack>
        )}
        rowActions={rowActions}
        selectable
        urlState
      />

      {/* 発行モーダル */}
      <ModalShell
        confirmLabel={tr("common.issue")}
        loading={isPending}
        onClose={() => setIssueOpen(false)}
        onConfirm={handleIssue}
        opened={issueOpen}
        size="sm"
        title={tr("settings.kiosk.issueQrCards")}
      >
        <Stack gap="xs">
          <Text c="dimmed" size="sm">
            {tr("settings.kiosk.issuesUnassignedCardsInABatch")}
          </Text>
          <NumberInput
            label={<HelpLabel {...fieldHelp("kioskCard", "count")} />}
            max={100}
            min={1}
            onChange={setIssueCount}
            value={issueCount}
            withAsterisk
          />
        </Stack>
      </ModalShell>

      {/* 割当モーダル */}
      <ModalShell
        confirmLabel={tr("common.allocation")}
        loading={isPending}
        onClose={() => setAssignTarget(null)}
        onConfirm={handleAssign}
        opened={assignTarget != null}
        size="sm"
        title={tr("common.cardAssignment")}
      >
        <Stack gap="xs">
          <Text ff="mono" size="sm">
            {assignTarget ? maskCardId(assignTarget.id) : ""}
          </Text>
          <Select
            data={userOptions}
            label={<HelpLabel {...fieldHelp("kioskCard", "user")} />}
            onChange={setAssignUserId}
            placeholder={tr("common.selectAUser")}
            searchable
            value={assignUserId}
            withAsterisk
          />
          <Text c="dimmed" size="xs">
            {tr("settings.kiosk.aUserCanHoldOnlyOne")}
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
          if (confirm) run(confirm.run, tr("common.done"));
        }}
        opened={confirm != null}
        title={confirm?.title ?? ""}
      />
    </ListShell>
  );
}
