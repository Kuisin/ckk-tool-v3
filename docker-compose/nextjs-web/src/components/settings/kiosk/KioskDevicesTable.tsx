"use client";

/**
 * KioskDevicesTable — 端末管理（SY09, /settings/kiosk-devices）の一覧。
 *
 * キオスク端末の有効化（登録コード入力 or QR スキャン）・編集・無効化・
 * 取り消し。オンライン列は useKioskPresence（WS ライブ）を優先し、
 * 未接続時はサーバー計算の initialOnline（5分以内の活動）で表示する。
 *
 * QR スキャンは BarcodeDetector 対応ブラウザのみ（feature-detect・追加依存なし）。
 */

import {
  Alert,
  Box,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconDeviceTablet,
  IconMap2,
  IconScan,
  IconSearch,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  activateDevice,
  disableDevice,
  enableDevice,
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
import { formatCode, normalizeCode } from "@/lib/crockford";
import { formatDateTime } from "@/lib/format";
import type { KioskDeviceRow, KioskFactoryOption } from "@/lib/kiosk-admin";
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

// ── QR スキャナ（BarcodeDetector — 対応ブラウザのみ表示） ────────────────────

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
};
type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return ctor ?? null;
}

/** タブレットの設定 QR（{type:"KIOSK_SETUP", code, deviceId}）から code を抽出。 */
function parseSetupQr(rawValue: string): string | null {
  try {
    const payload = JSON.parse(rawValue) as {
      type?: string;
      code?: string;
    };
    if (payload.type === "KIOSK_SETUP" && typeof payload.code === "string") {
      const code = normalizeCode(payload.code);
      return code.length === 12 ? code : null;
    }
  } catch {
    // JSON でない QR は無視
  }
  return null;
}

function SetupQrScanner({ onCode }: { onCode: (code: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    const ctor = getBarcodeDetectorCtor();
    if (!ctor) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setScanning(true);
      // video 要素は setScanning 後に描画されるため、次フレームで割り当てる。
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video || !streamRef.current) return;
        video.srcObject = streamRef.current;
        video.play().catch(() => undefined);
        const detector = new ctor({ formats: ["qr_code"] });
        timerRef.current = setInterval(async () => {
          const el = videoRef.current;
          if (!el || el.readyState < 2) return;
          try {
            const results = await detector.detect(el);
            for (const r of results) {
              const code = parseSetupQr(r.rawValue);
              if (code) {
                stop();
                onCode(code);
                return;
              }
            }
          } catch {
            // 検出失敗は無視して次のフレームへ
          }
        }, 500);
      });
    } catch {
      setError("カメラを起動できませんでした");
    }
  };

  if (!getBarcodeDetectorCtor()) return null; // 非対応ブラウザでは非表示

  return (
    <Stack gap="xs">
      {scanning ? (
        <>
          {/* カメラのライブプレビュー（音声なし・muted） */}
          <video
            muted
            playsInline
            ref={videoRef}
            style={{ width: "100%", borderRadius: 8, background: "#000" }}
          />
          <SecondaryButton onClick={stop}>スキャンを停止</SecondaryButton>
        </>
      ) : (
        <SecondaryButton leftSection={<IconScan size={14} />} onClick={start}>
          設定QRをスキャン
        </SecondaryButton>
      )}
      {error && (
        <Text c="red" size="xs">
          {error}
        </Text>
      )}
    </Stack>
  );
}

// ── 本体 ────────────────────────────────────────────────────────────────────

interface DeviceFormState {
  name: string;
  factoryId: string | null;
  location: string;
}

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

  // 有効化モーダル
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateCode, setActivateCode] = useState("");
  const [activateForm, setActivateForm] = useState<DeviceFormState>({
    name: "",
    factoryId: null,
    location: "",
  });
  // 編集モーダル
  const [editTarget, setEditTarget] = useState<KioskDeviceRow | null>(null);
  const [editForm, setEditForm] = useState<DeviceFormState>({
    name: "",
    factoryId: null,
    location: "",
  });
  // 破壊的操作の確認
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    run: () => Promise<ActionResult>;
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

  const handleActivate = () => {
    const factoryId = Number(activateForm.factoryId);
    if (!activateCode.trim() || !activateForm.name.trim() || !factoryId) {
      notifications.show({
        title: "エラー",
        message: "登録コード・端末名・工場は必須です",
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const result = await activateDevice({
        registrationCode: activateCode,
        name: activateForm.name,
        factoryId,
        location: activateForm.location,
      });
      if (result.ok) {
        setActivateOpen(false);
        setActivateCode("");
        setActivateForm({ name: "", factoryId: null, location: "" });
        notifications.show({
          title: "有効化しました",
          message: "端末側の画面が自動で切り替わります",
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
      render: (r) =>
        r.name ? (
          <Text fw={500} size="sm" truncate>
            {r.name}
          </Text>
        ) : (
          <Text c="dimmed" size="sm">
            （未設定）
          </Text>
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
      // PENDING（有効化待ち）は黄色バッジで強調される（StatusBadge のマップ）。
      render: (r) => <StatusBadge entity="KioskDevice" status={r.status} />,
      sortValue: (r) => r.status,
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
    if (r.status === "ACTIVE" || r.status === "DISABLED") {
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
    if (r.status !== "REVOKED") {
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
          <CreateButton
            loading={isPending}
            onClick={() => setActivateOpen(true)}
          >
            端末を追加
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

      {/* 有効化モーダル */}
      <ModalShell
        confirmLabel="有効化"
        loading={isPending}
        onClose={() => setActivateOpen(false)}
        onConfirm={handleActivate}
        opened={activateOpen}
        size="md"
        title="端末を追加（有効化）"
      >
        <Stack gap="sm">
          <Alert color="blue" variant="light">
            タブレット側の設定画面に表示されている 12
            文字の登録コードを入力してください。有効化するとタブレットが自動で
            キオスクとして使用可能になります。
          </Alert>
          <TextInput
            label="登録コード"
            onChange={(e) =>
              setActivateCode(normalizeCode(e.currentTarget.value).slice(0, 12))
            }
            placeholder="XXXX-XXXX-XXXX"
            styles={{
              input: { fontFamily: "var(--mantine-font-family-monospace)" },
            }}
            value={formatCode(activateCode)}
            withAsterisk
          />
          <SetupQrScanner onCode={setActivateCode} />
          <TextInput
            label="端末名"
            onChange={(e) =>
              setActivateForm((s) => ({ ...s, name: e.currentTarget.value }))
            }
            placeholder="例: 1F 加工場 タブレット1"
            value={activateForm.name}
            withAsterisk
          />
          <Select
            data={factoryOptions}
            label="工場"
            onChange={(v) => setActivateForm((s) => ({ ...s, factoryId: v }))}
            placeholder="工場を選択"
            searchable
            value={activateForm.factoryId}
            withAsterisk
          />
          <TextInput
            label="場所"
            onChange={(e) =>
              setActivateForm((s) => ({
                ...s,
                location: e.currentTarget.value,
              }))
            }
            placeholder="例: 検査室入口"
            value={activateForm.location}
          />
        </Stack>
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

      {/* 破壊的操作の確認 */}
      <ConfirmModal
        confirmLabel={confirm?.confirmLabel ?? "実行"}
        loading={isPending}
        message={confirm?.message ?? ""}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) run(confirm.run, "操作が完了しました");
        }}
        opened={confirm != null}
        title={confirm?.title ?? ""}
      />
    </ListShell>
  );
}
