"use client";

/**
 * KioskDevicesTable — 端末管理（SY09, /settings/kiosk-devices）の一覧。
 *
 * プロファイル先行の登録フロー:
 *   1. 管理者がここで端末プロファイルを作成（PENDING = リンク待ち）→
 *      リンクコード（12桁・24時間期限）と QR がこの画面に表示される。
 *   2. タブレットの設定画面（/setup）がコードを入力/カメラでスキャン →
 *      LINKED（有効化待ち）になる。
 *   3. 管理者が LINKED の行のみ「有効化」→ ACTIVE。タブレット側が自動検知。
 *
 * オンライン列は useKioskPresence（WS ライブ）を優先し、未接続時は
 * サーバー計算の initialOnline（5分以内の活動）で表示する。
 */

import {
  Alert,
  Box,
  Center,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDeviceTablet, IconMap2, IconSearch } from "@tabler/icons-react";
import { useMemo, useState, useTransition } from "react";
import {
  activateDevice,
  createDeviceProfile,
  deleteDeviceProfile,
  disableDevice,
  enableDevice,
  regenerateLinkCode,
  resetDeviceKey,
  revokeDevice,
  updateDevice,
} from "@/app/(dashboard)/settings/kiosk-devices/actions";
import { CreateButton, SecondaryButton } from "@/components/ui/buttons";
import {
  type Column,
  DataTable,
  type RowAction,
} from "@/components/ui/DataTable";
import { ConfirmModal, ModalShell } from "@/components/ui/modals";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { formatCode } from "@/lib/crockford";
import { formatDateTime } from "@/lib/format";
import type { KioskDeviceRow, KioskFactoryOption } from "@/lib/kiosk-admin";
import { qrSvg } from "@/lib/qr";
import type { ActionResult } from "@/lib/server-action";
import { type KioskPresenceEntry, useKioskPresence } from "./useKioskPresence";

// ── オンライン表示（緑/灰ドット） ────────────────────────────────────────────

export function OnlineDot({
  online,
  label,
}: {
  online: boolean;
  label?: string;
}) {
  return (
    <Group gap={6} wrap="nowrap">
      <Box
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          flexShrink: 0,
          backgroundColor: online
            ? "var(--mantine-color-green-6)"
            : "var(--mantine-color-gray-4)",
        }}
      />
      <Text c={online ? "green" : "dimmed"} size="sm">
        {label ?? (online ? "オンライン" : "オフライン")}
      </Text>
    </Group>
  );
}

/** ライブ購読（優先）→ サーバー計算 initialOnline のフォールバック。 */
export function resolveOnline(
  row: Pick<KioskDeviceRow, "id" | "status" | "initialOnline">,
  presence: ReadonlyMap<string, KioskPresenceEntry>,
  live: boolean,
): boolean {
  if (row.status !== "ACTIVE") return false;
  if (live) return presence.get(row.id)?.isOnline ?? false;
  return row.initialOnline;
}

// ── リンクコード表示（QR + コード + 期限） ───────────────────────────────────

function isCodeExpired(row: KioskDeviceRow): boolean {
  return (
    row.registrationExpiresAt != null &&
    new Date(row.registrationExpiresAt).getTime() <= Date.now()
  );
}

function LinkCodePanel({ row }: { row: KioskDeviceRow }) {
  const code = row.registrationCode;
  const formatted = code ? formatCode(code) : null;
  // QR のペイロードは表示形（ダッシュ入り）— タブレット側は normalizeCode で吸収。
  const svg = useMemo(
    () => (formatted ? qrSvg(formatted, { moduleSize: 6 }) : null),
    [formatted],
  );
  if (!code || !formatted || !svg) {
    return (
      <Alert color="green" variant="light">
        この端末はタブレットとリンク済みです。「有効化」で使用を開始できます。
      </Alert>
    );
  }
  const expired = isCodeExpired(row);
  return (
    <Stack align="center" gap="sm">
      <Text c="dimmed" size="sm" ta="center">
        タブレットの設定画面（/setup）でこのコードを入力するか、
        タブレットのカメラでこの QR をスキャンしてください。
      </Text>
      {/* QR は白地パディング付き（画面越しにタブレットカメラで読むため） */}
      <Center
        p="md"
        style={{
          background: "#ffffff",
          borderRadius: 8,
          lineHeight: 0,
          border: "1px solid var(--mantine-color-default-border)",
        }}
      >
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 自前 qrSvg の出力（信頼済み） */}
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </Center>
      <Text ff="monospace" fw={700} size="xl" ta="center">
        {formatted}
      </Text>
      <Text c={expired ? "red" : "dimmed"} size="xs" ta="center">
        {expired
          ? `有効期限切れ（${formatDateTime(row.registrationExpiresAt ?? "")}）— 「再発行」で新しいコードを発行してください`
          : `有効期限: ${row.registrationExpiresAt ? formatDateTime(row.registrationExpiresAt) : "—"}`}
      </Text>
    </Stack>
  );
}

// ── 本体 ────────────────────────────────────────────────────────────────────

interface DeviceFormState {
  name: string;
  factoryId: string | null;
  location: string;
}

const EMPTY_FORM: DeviceFormState = { name: "", factoryId: null, location: "" };

export function KioskDevicesTable({
  rows,
  factoryOptions,
}: {
  rows: KioskDeviceRow[];
  factoryOptions: KioskFactoryOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const { presence, live } = useKioskPresence();

  const [search, setSearch] = useUrlStringState("q");
  const [factory, setFactory] = useUrlSelectState("factory");
  const [status, setStatus] = useUrlSelectState("status");

  // プロファイル作成モーダル
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<DeviceFormState>(EMPTY_FORM);
  // リンクコード表示モーダル（rows から常に最新の行を引く）
  const [codeTargetId, setCodeTargetId] = useState<string | null>(null);
  const codeTarget = codeTargetId
    ? (rows.find((r) => r.id === codeTargetId) ?? null)
    : null;
  // 編集モーダル
  const [editTarget, setEditTarget] = useState<KioskDeviceRow | null>(null);
  const [editForm, setEditForm] = useState<DeviceFormState>(EMPTY_FORM);
  // 確認モーダル（有効化・破壊的操作）
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    confirmColor?: string;
    successMessage?: string;
    run: () => Promise<ActionResult<unknown>>;
  } | null>(null);

  const reset = () => {
    setSearch(null);
    setFactory(null);
    setStatus(null);
  };

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (r.name ?? "").toLowerCase().includes(q) ||
      (r.location ?? "").toLowerCase().includes(q) ||
      (r.factoryLabel ?? "").toLowerCase().includes(q);
    const matchesFactory = !factory || String(r.factoryId ?? "") === factory;
    const matchesStatus = !status || r.status === status;
    return matchesSearch && matchesFactory && matchesStatus;
  });

  const run = (
    action: () => Promise<ActionResult<unknown>>,
    successMessage: string,
  ) => {
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

  const handleCreate = () => {
    const factoryId = Number(createForm.factoryId);
    if (!createForm.name.trim() || !factoryId) {
      notifications.show({
        title: "エラー",
        message: "端末名・工場は必須です",
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const result = await createDeviceProfile({
        name: createForm.name,
        factoryId,
        location: createForm.location,
      });
      if (result.ok) {
        setCreateOpen(false);
        setCreateForm(EMPTY_FORM);
        // 作成直後にリンクコードを表示（revalidate 済みの rows から引ける）
        setCodeTargetId(result.data.id);
        notifications.show({
          title: "作成しました",
          message:
            "端末プロファイルを作成しました。タブレットでリンクコードを入力してください",
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

  const openEdit = (r: KioskDeviceRow) => {
    setEditTarget(r);
    setEditForm({
      name: r.name ?? "",
      factoryId: r.factoryId != null ? String(r.factoryId) : null,
      location: r.location ?? "",
    });
  };

  const handleEdit = () => {
    if (!editTarget) return;
    const factoryId = Number(editForm.factoryId);
    if (!editForm.name.trim() || !factoryId) {
      notifications.show({
        title: "エラー",
        message: "端末名・工場は必須です",
        color: "red",
      });
      return;
    }
    const id = editTarget.id;
    startTransition(async () => {
      const result = await updateDevice({
        id,
        name: editForm.name,
        factoryId,
        location: editForm.location,
      });
      if (result.ok) {
        setEditTarget(null);
        notifications.show({
          title: "保存しました",
          message: "端末情報を更新しました",
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

  const columns: Column<KioskDeviceRow>[] = [
    {
      key: "name",
      header: "端末名",
      sortable: true,
      render: (r) => (
        <div>
          {r.name ? (
            <Text fw={500} size="sm" truncate>
              {r.name}
            </Text>
          ) : (
            <Text c="dimmed" size="sm">
              （未設定）
            </Text>
          )}
          {r.fingerprint && (
            <Tooltip
              label={`アテステーション鍵: ${r.fingerprint}`}
              withinPortal
            >
              <Text c="dimmed" ff="monospace" size="xs">
                🔑 {r.fingerprint.slice(0, 12)}…
              </Text>
            </Tooltip>
          )}
        </div>
      ),
      sortValue: (r) => r.name ?? "",
    },
    {
      key: "location",
      header: "場所",
      hideable: true,
      render: (r) => (
        <Text c={r.location ? undefined : "dimmed"} size="sm" truncate>
          {r.location ?? "—"}
        </Text>
      ),
    },
    {
      key: "factory",
      header: "工場",
      sortable: true,
      render: (r) => (
        <Text c={r.factoryLabel ? undefined : "dimmed"} size="sm" truncate>
          {r.factoryLabel ?? "—"}
        </Text>
      ),
      sortValue: (r) => r.factoryLabel ?? "",
    },
    {
      key: "status",
      header: "状態",
      width: 110,
      sortable: true,
      // PENDING=リンク待ち（灰）/ LINKED=有効化待ち（黄）— StatusBadge のマップ。
      render: (r) => <StatusBadge entity="KioskDevice" status={r.status} />,
      sortValue: (r) => r.status,
    },
    {
      key: "link",
      header: "リンク",
      width: 170,
      hideable: true,
      render: (r) => {
        if (r.status === "PENDING" && r.registrationCode) {
          const expired = isCodeExpired(r);
          return (
            <div>
              <Text ff="monospace" size="xs">
                {formatCode(r.registrationCode)}
              </Text>
              <Text c={expired ? "red" : "dimmed"} size="xs">
                {expired
                  ? "期限切れ"
                  : `期限 ${r.registrationExpiresAt ? formatDateTime(r.registrationExpiresAt) : "—"}`}
              </Text>
            </div>
          );
        }
        if (r.linkedAt) {
          return (
            <Text c="dimmed" size="xs">
              リンク {formatDateTime(r.linkedAt)}
            </Text>
          );
        }
        return (
          <Text c="dimmed" size="sm">
            —
          </Text>
        );
      },
      sortValue: (r) => r.linkedAt ?? r.registrationExpiresAt ?? "",
    },
    {
      key: "online",
      header: "オンライン",
      width: 120,
      sortable: true,
      render: (r) =>
        r.status === "ACTIVE" ? (
          <Tooltip
            label={live ? "ライブ (WS)" : "直近5分の活動から判定"}
            withinPortal
          >
            <Box>
              <OnlineDot online={resolveOnline(r, presence, live)} />
            </Box>
          </Tooltip>
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ),
      sortValue: (r) => (resolveOnline(r, presence, live) ? 0 : 1),
    },
    {
      key: "lastActivityAt",
      header: "最終アクティビティ",
      width: 160,
      sortable: true,
      render: (r) => {
        const liveEntry = live ? presence.get(r.id) : null;
        const at = liveEntry?.lastActivityAt ?? r.lastActivityAt;
        return (
          <Text c="dimmed" size="sm">
            {at ? formatDateTime(at) : "—"}
          </Text>
        );
      },
      sortValue: (r) => r.lastActivityAt ?? "",
    },
    {
      key: "activatedBy",
      header: "有効化者",
      width: 140,
      hideable: true,
      render: (r) => (
        <Text c={r.activatedByName ? undefined : "dimmed"} size="sm" truncate>
          {r.activatedByName ?? "—"}
        </Text>
      ),
    },
  ];

  const rowActions = (r: KioskDeviceRow): RowAction<KioskDeviceRow>[] => {
    const actions: RowAction<KioskDeviceRow>[] = [];
    if (r.status === "PENDING") {
      actions.push({
        label: "リンクコードを表示",
        onAction: () => setCodeTargetId(r.id),
      });
    }
    if (r.status === "LINKED") {
      actions.push({
        label: "有効化",
        onAction: () =>
          setConfirm({
            title: "有効化の確認",
            message: `この端末を有効化します（タブレットとのリンク: ${
              r.linkedAt ? formatDateTime(r.linkedAt) : "—"
            }）。有効化するとタブレットが自動でキオスクとして使用可能になります。`,
            confirmLabel: "有効化",
            confirmColor: "green",
            successMessage:
              "端末を有効化しました。端末側の画面が自動で切り替わります",
            run: () => activateDevice(r.id),
          }),
      });
    }
    if (r.status !== "REVOKED") {
      actions.push({ label: "編集", onAction: () => openEdit(r) });
    }
    if (r.status === "ACTIVE") {
      actions.push({
        label: "無効化",
        color: "orange",
        onAction: () =>
          setConfirm({
            title: "無効化の確認",
            message:
              "この端末を一時的に無効化します（再有効化できます）。無効化中はキオスクとして使用できません。",
            confirmLabel: "無効化",
            run: () => disableDevice(r.id),
          }),
      });
    }
    if (r.status === "DISABLED") {
      actions.push({
        label: "再有効化",
        onAction: () => run(() => enableDevice(r.id), "端末を再有効化しました"),
      });
    }
    if (r.fingerprint) {
      actions.push({
        label: "鍵リセット",
        color: "orange",
        onAction: () =>
          setConfirm({
            title: "鍵リセットの確認",
            message:
              "端末アプリのアテステーション鍵を解除します。次回この端末のアプリが接続したときに新しい鍵が束縛されます（端末を交換・初期化した場合に使用）。",
            confirmLabel: "鍵リセット",
            run: () => resetDeviceKey(r.id),
          }),
      });
    }
    if (r.status === "PENDING") {
      actions.push({
        label: "削除",
        color: "red",
        onAction: () =>
          setConfirm({
            title: "削除の確認",
            message:
              "リンク前の端末プロファイルを削除します。リンクコードは無効になります。この操作は取り消せません。",
            confirmLabel: "削除",
            successMessage: "端末プロファイルを削除しました",
            run: () => deleteDeviceProfile(r.id),
          }),
      });
    } else if (r.status !== "REVOKED") {
      actions.push({
        label: "取り消し",
        color: "red",
        onAction: () =>
          setConfirm({
            title: "取り消しの確認",
            message:
              "端末を取り消します。デバイストークンは破棄され、再登録が必要になります。この操作は取り消せません。",
            confirmLabel: "取り消し",
            run: () => revokeDevice(r.id),
          }),
      });
    }
    return actions;
  };

  return (
    <ListShell
      action={
        <Group gap="xs" wrap="nowrap">
          <SecondaryButton
            href="/settings/kiosk-devices/map"
            leftSection={<IconMap2 size={14} />}
          >
            フロアマップ
          </SecondaryButton>
          <CreateButton loading={isPending} onClick={() => setCreateOpen(true)}>
            端末プロファイル作成
          </CreateButton>
        </Group>
      }
      breadcrumbs={["システム", "端末管理"]}
      filters={
        <>
          <Select
            clearable
            data={factoryOptions}
            onChange={setFactory}
            placeholder="工場"
            searchable
            value={factory}
            w={180}
          />
          <Select
            clearable
            data={statusOptions("KioskDevice")}
            onChange={setStatus}
            placeholder="状態"
            value={status}
            w={140}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value || null)}
          placeholder="端末名 / 場所 / 工場..."
          value={search}
        />
      }
      title="端末管理"
    >
      <DataTable
        columns={columns}
        data={filtered}
        emptyIcon={<IconDeviceTablet size={28} />}
        emptyMessage="キオスク端末がありません"
        getRowId={(r) => r.id}
        rowActions={rowActions}
        urlState
      />

      {/* プロファイル作成モーダル */}
      <ModalShell
        confirmLabel="作成"
        loading={isPending}
        onClose={() => setCreateOpen(false)}
        onConfirm={handleCreate}
        opened={createOpen}
        size="md"
        title="端末プロファイル作成"
      >
        <Stack gap="sm">
          <Alert color="blue" variant="light">
            プロファイルを作成すると 24 時間有効なリンクコードが発行されます。
            タブレットの設定画面でコードを入力（またはカメラで QR
            をスキャン）してリンクした後、この画面から有効化できます。
          </Alert>
          <TextInput
            label="端末名"
            onChange={(e) =>
              setCreateForm((s) => ({ ...s, name: e.currentTarget.value }))
            }
            placeholder="例: 1F 加工場 タブレット1"
            value={createForm.name}
            withAsterisk
          />
          <Select
            data={factoryOptions}
            label="工場"
            onChange={(v) => setCreateForm((s) => ({ ...s, factoryId: v }))}
            placeholder="工場を選択"
            searchable
            value={createForm.factoryId}
            withAsterisk
          />
          <TextInput
            label="場所"
            onChange={(e) =>
              setCreateForm((s) => ({
                ...s,
                location: e.currentTarget.value,
              }))
            }
            placeholder="例: 検査室入口"
            value={createForm.location}
          />
        </Stack>
      </ModalShell>

      {/* リンクコード表示モーダル */}
      <ModalShell
        cancelLabel="閉じる"
        confirmLabel="再発行"
        loading={isPending}
        onClose={() => setCodeTargetId(null)}
        onConfirm={
          codeTarget?.status === "PENDING"
            ? () =>
                run(
                  () => regenerateLinkCode(codeTarget.id),
                  "新しいリンクコードを発行しました",
                )
            : undefined
        }
        opened={codeTarget != null}
        size="md"
        title={`リンクコード — ${codeTarget?.name ?? ""}`}
      >
        {codeTarget && <LinkCodePanel row={codeTarget} />}
      </ModalShell>

      {/* 編集モーダル */}
      <ModalShell
        confirmLabel="保存"
        loading={isPending}
        onClose={() => setEditTarget(null)}
        onConfirm={handleEdit}
        opened={editTarget != null}
        size="md"
        title="端末の編集"
      >
        <Stack gap="sm">
          <TextInput
            label="端末名"
            onChange={(e) =>
              setEditForm((s) => ({ ...s, name: e.currentTarget.value }))
            }
            value={editForm.name}
            withAsterisk
          />
          <Select
            data={factoryOptions}
            label="工場"
            onChange={(v) => setEditForm((s) => ({ ...s, factoryId: v }))}
            searchable
            value={editForm.factoryId}
            withAsterisk
          />
          <TextInput
            label="場所"
            onChange={(e) =>
              setEditForm((s) => ({ ...s, location: e.currentTarget.value }))
            }
            value={editForm.location}
          />
          <Text c="dimmed" size="xs">
            工場を変更するとフロアマップ上のピン配置は解除されます。
          </Text>
        </Stack>
      </ModalShell>

      {/* 有効化・破壊的操作の確認 */}
      <ConfirmModal
        confirmColor={confirm?.confirmColor ?? "red"}
        confirmLabel={confirm?.confirmLabel ?? "実行"}
        loading={isPending}
        message={confirm?.message ?? ""}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) {
            run(confirm.run, confirm.successMessage ?? "操作が完了しました");
          }
        }}
        opened={confirm != null}
        title={confirm?.title ?? ""}
      />
    </ListShell>
  );
}
