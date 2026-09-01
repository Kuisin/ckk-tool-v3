"use client";

/**
 * KioskDevicesTable — 端末管理（SY09, /settings/kiosk-devices）の一覧。
 *
 * プロファイル先行の登録フロー:
 *   1. 管理者がここで端末プロファイルを作成（PENDING = オープン/リンク待ち）。
 *   2. タブレットの設定画面（/setup）が QR + 12 文字コード（10分期限）を表示 →
 *      管理者が「端末をリンク」でそのコードを入力/カメラでスキャン →
 *      LINKED（有効化待ち）になる。
 *   3. 管理者が LINKED の行のみ「有効化」→ ACTIVE。タブレット側が自動検知。
 *   端末の交換・故障時は「リンク解除」でプロファイルをオープンに戻し
 *   （名称・拠点・場所・ピンは保持）、新しい端末を再リンクできる。
 *
 * QR スキャンは qr-scanner（nextjs-kiosk と同じライブラリ）— iOS Safari 含む
 * 全ブラウザで動作する（旧 BarcodeDetector 実装は iOS/Firefox で非表示だった）。
 * オンライン列は useKioskPresence（WS ライブ）を優先し、未接続時は
 * サーバー計算の initialOnline（5分以内の活動）で表示する。
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
import { IconDeviceTablet, IconMap2, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  activateDevice,
  createDeviceProfile,
  deleteDeviceProfile,
  disableDevice,
  enableDevice,
  linkDeviceToProfile,
  resetDeviceKey,
  revokeDevice,
  unlinkDevice,
  updateDevice,
} from "@/app/(dashboard)/settings/kiosk-devices/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { OwnershipBadge } from "@/components/settings/security/ownership";
import { CreateButton, SecondaryButton } from "@/components/ui/buttons";
import {
  type Column,
  DataTable,
  type RowAction,
} from "@/components/ui/DataTable";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { ConfirmModal, ModalShell } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell, LocalizedTextInput } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { formatCode, normalizeCode } from "@/lib/crockford";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import type { KioskDeviceRow, KioskPlantOption } from "@/lib/kiosk-admin";
import type { ActionResult } from "@/lib/server-action";
import { statusOptions } from "@/lib/status-map";
import { KioskDeviceLogsModal } from "./KioskDeviceLogsModal";
import { LinkQrScanner } from "./LinkQrScanner";
import {
  type KioskPresenceEntry,
  type KioskPresenceTransport,
  useKioskPresence,
} from "./useKioskPresence";

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

/** 現在の利用者名: ライブ購読（優先）→ サーバー計算のフォールバック。 */
export function resolveCurrentUserName(
  row: Pick<KioskDeviceRow, "id" | "status" | "currentUserName">,
  presence: ReadonlyMap<string, KioskPresenceEntry>,
  live: boolean,
): string | null {
  if (row.status !== "ACTIVE") return null;
  if (live) return presence.get(row.id)?.user?.displayName ?? null;
  return row.currentUserName;
}

/** オンライン列ツールチップ: プレゼンスの供給元表示。 */
export function transportLabel(transport: KioskPresenceTransport): string {
  if (transport === "ws") return "ライブ (WS)";
  if (transport === "poll") return "自動更新（30秒）";
  return "直近5分の活動から判定";
}

// ── 本体 ────────────────────────────────────────────────────────────────────

interface DeviceFormState {
  /** 端末名は多言語（可変キー JSON）。ja 以外は「多言語」ポップアップで編集。 */
  nameJa: string;
  nameTranslations: Record<string, string>;
  plantId: string | null;
  location: string;
  /** 既定の作業場所（編集のみ — 作成時は拠点未定のため設定不可）。 */
  defaultWorkLocationId: string | null;
}

const EMPTY_FORM: DeviceFormState = {
  nameJa: "",
  nameTranslations: {},
  plantId: null,
  location: "",
  defaultWorkLocationId: null,
};

export function KioskDevicesTable({
  rows,
  plantOptions,
  workLocationOptions = [],
}: {
  rows: KioskDeviceRow[];
  plantOptions: KioskPlantOption[];
  /** 既定作業場所の選択肢（グループの拠点付き — 端末の拠点で絞り込む）。 */
  workLocationOptions?: {
    value: string;
    label: string;
    plantId: number | null;
  }[];
}) {
  const fmt = useFormat();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();
  const { presence, live, transport } = useKioskPresence();

  const [search, setSearch] = useUrlStringState("q");
  const [plant, setPlant] = useUrlSelectState("plant");
  const [status, setStatus] = useUrlSelectState("status");

  // プロファイル作成モーダル
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<DeviceFormState>(EMPTY_FORM);
  // 端末リンクモーダル（PENDING 行 → タブレット側コードを入力/スキャン）
  const [linkTarget, setLinkTarget] = useState<KioskDeviceRow | null>(null);
  const [linkCode, setLinkCode] = useState("");
  // 編集モーダル
  const [editTarget, setEditTarget] = useState<KioskDeviceRow | null>(null);
  const [editForm, setEditForm] = useState<DeviceFormState>(EMPTY_FORM);
  // 利用履歴モーダル
  const [logsTarget, setLogsTarget] = useState<KioskDeviceRow | null>(null);
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
    setPlant(null);
    setStatus(null);
  };

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (r.name ?? "").toLowerCase().includes(q) ||
      (r.location ?? "").toLowerCase().includes(q) ||
      (r.plantLabel ?? "").toLowerCase().includes(q);
    const matchesPlant = !plant || String(r.plantId ?? "") === plant;
    const matchesStatus = !status || r.status === status;
    return matchesSearch && matchesPlant && matchesStatus;
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
    const plantId = Number(createForm.plantId);
    if (!createForm.nameJa.trim() || !plantId) {
      notifications.show({
        title: "エラー",
        message: "端末名・拠点は必須です",
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const result = await createDeviceProfile({
        nameJa: createForm.nameJa,
        nameTranslations: createForm.nameTranslations,
        plantId,
        location: createForm.location,
      });
      if (result.ok) {
        setCreateOpen(false);
        setCreateForm(EMPTY_FORM);
        notifications.show({
          title: "作成しました",
          message:
            "端末プロファイルを作成しました。「端末をリンク」からタブレットのコードでリンクしてください",
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

  const openLink = (r: KioskDeviceRow) => {
    setLinkTarget(r);
    setLinkCode("");
  };

  const handleLink = () => {
    if (!linkTarget) return;
    const code = normalizeCode(linkCode);
    if (code.length !== 12) {
      notifications.show({
        title: "エラー",
        message: "コードは 12 文字で入力してください",
        color: "red",
      });
      return;
    }
    const id = linkTarget.id;
    startTransition(async () => {
      const result = await linkDeviceToProfile(id, code);
      if (result.ok) {
        setLinkTarget(null);
        setLinkCode("");
        notifications.show({
          title: "リンクしました",
          message: "リンクしました。有効化できます",
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
      nameJa: r.nameJa,
      nameTranslations: r.nameTranslations,
      plantId: r.plantId != null ? String(r.plantId) : null,
      location: r.location ?? "",
      defaultWorkLocationId:
        r.defaultWorkLocationId != null
          ? String(r.defaultWorkLocationId)
          : null,
    });
  };

  const handleEdit = () => {
    if (!editTarget) return;
    const plantId = Number(editForm.plantId);
    if (!editForm.nameJa.trim() || !plantId) {
      notifications.show({
        title: "エラー",
        message: "端末名・拠点は必須です",
        color: "red",
      });
      return;
    }
    const id = editTarget.id;
    startTransition(async () => {
      const result = await updateDevice({
        id,
        nameJa: editForm.nameJa,
        nameTranslations: editForm.nameTranslations,
        plantId,
        location: editForm.location,
        defaultWorkLocationId: editForm.defaultWorkLocationId
          ? Number(editForm.defaultWorkLocationId)
          : null,
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
      key: "plant",
      header: "拠点",
      sortable: true,
      render: (r) => (
        <Text c={r.plantLabel ? undefined : "dimmed"} size="sm" truncate>
          {r.plantLabel ?? "—"}
        </Text>
      ),
      sortValue: (r) => r.plantLabel ?? "",
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
      // 所有区分（自動判定）。根拠の強さはバッジのツールチップに出る。
      key: "ownership",
      header: "端末区分",
      width: 130,
      hideable: true,
      sortable: true,
      render: (r) => (
        <OwnershipBadge source={r.ownershipSource} value={r.ownership} />
      ),
      sortValue: (r) => r.ownership,
    },
    {
      key: "link",
      header: "リンク",
      width: 150,
      hideable: true,
      render: (r) => {
        if (r.status === "PENDING") {
          return (
            <Text c="dimmed" size="sm">
              未リンク
            </Text>
          );
        }
        return (
          <Text c="dimmed" size="xs">
            {r.linkedAt ? fmt.dateTime(r.linkedAt) : "—"}
          </Text>
        );
      },
      sortValue: (r) => r.linkedAt ?? "",
    },
    {
      key: "online",
      header: "オンライン",
      width: 120,
      sortable: true,
      render: (r) =>
        r.status === "ACTIVE" ? (
          <Tooltip label={transportLabel(transport)} withinPortal>
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
      key: "currentUser",
      header: "利用者",
      width: 140,
      sortable: true,
      render: (r) => {
        const name = resolveCurrentUserName(r, presence, live);
        return (
          <Text c={name ? undefined : "dimmed"} size="sm" truncate>
            {name ?? "—"}
          </Text>
        );
      },
      sortValue: (r) => resolveCurrentUserName(r, presence, live) ?? "",
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
            {at ? fmt.dateTime(at) : "—"}
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
        label: "端末をリンク",
        onAction: () => openLink(r),
      });
    }
    if (r.status === "LINKED") {
      actions.push({
        label: "有効化",
        onAction: () =>
          setConfirm({
            title: "有効化の確認",
            message: `この端末を有効化します（タブレットとのリンク: ${
              r.linkedAt ? fmt.dateTime(r.linkedAt) : "—"
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
    actions.push({ label: "利用履歴", onAction: () => setLogsTarget(r) });
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
    if (
      r.status === "LINKED" ||
      r.status === "ACTIVE" ||
      r.status === "DISABLED"
    ) {
      actions.push({
        label: "リンク解除",
        color: "red",
        onAction: () =>
          setConfirm({
            title: "リンク解除の確認",
            message:
              "この端末のリンクを解除します。セッション・デバイストークン・アテステーション鍵が破棄され、プロファイルはオープン（リンク待ち）に戻ります。端末を交換・再リンクする場合に使用してください。",
            confirmLabel: "リンク解除",
            successMessage:
              "リンクを解除しました。プロファイルはオープン（リンク待ち）に戻りました",
            run: () => unlinkDevice(r.id),
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
              "リンク前の端末プロファイルを削除します。この操作は取り消せません。",
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
            style={{ flexShrink: 0 }}
          >
            {isMobile ? "マップ" : "フロアマップ"}
          </SecondaryButton>
          <CreateButton
            loading={isPending}
            onClick={() => setCreateOpen(true)}
            style={{ flexShrink: 0 }}
          >
            {isMobile ? "作成" : "端末プロファイル作成"}
          </CreateButton>
        </Group>
      }
      breadcrumbs={["システム", "端末管理"]}
      filters={
        <>
          <Select
            clearable
            data={plantOptions}
            onChange={setPlant}
            placeholder="拠点"
            searchable
            style={isMobile ? { flex: 1 } : undefined}
            value={plant}
            w={isMobile ? undefined : 180}
          />
          <Select
            clearable
            data={statusOptions("KioskDevice")}
            onChange={setStatus}
            placeholder="状態"
            style={isMobile ? { flex: 1 } : undefined}
            value={status}
            w={isMobile ? undefined : 140}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value || null)}
          placeholder="端末名 / 場所 / 拠点..."
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
        onRowClick={(r) => router.push(`/settings/kiosk-devices/${r.id}`)}
        renderCard={(r) => {
          const online = resolveOnline(r, presence, live);
          const userName = resolveCurrentUserName(r, presence, live);
          const liveEntry = live ? presence.get(r.id) : null;
          const lastAt = liveEntry?.lastActivityAt ?? r.lastActivityAt;
          return (
            <Stack gap={3} style={{ minWidth: 0 }}>
              <Text fw={600} size="sm" truncate>
                {r.name ?? "（未設定）"}
              </Text>
              <Text c="dimmed" size="xs" truncate>
                {[r.plantLabel, r.location].filter(Boolean).join(" / ") || "—"}
              </Text>
              <Group gap="xs" wrap="wrap">
                <StatusBadge entity="KioskDevice" status={r.status} />
                {r.status === "ACTIVE" && <OnlineDot online={online} />}
                {userName && (
                  <Text c="blue" size="xs" truncate>
                    {userName} が利用中
                  </Text>
                )}
              </Group>
              <Text c="dimmed" size="xs">
                最終アクティビティ {lastAt ? fmt.dateTime(lastAt) : "—"}
              </Text>
            </Stack>
          );
        }}
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
            プロファイルはオープン（リンク待ち）で作成されます。タブレットの
            設定画面（/setup）に表示されるコードを「端末をリンク」で
            入力またはスキャンしてリンクした後、この画面から有効化できます。
          </Alert>
          <LocalizedTextInput
            help={fieldHelpTip("kioskDevice", "name")}
            jaProps={{
              value: createForm.nameJa,
              onChange: (v: string) =>
                setCreateForm((s) => ({ ...s, nameJa: v })),
            }}
            label="端末名"
            placeholder="例: 1F 加工場 タブレット1"
            required
            translationsProps={{
              value: createForm.nameTranslations,
              onChange: (v: Record<string, string>) =>
                setCreateForm((s) => ({ ...s, nameTranslations: v })),
            }}
          />
          <Select
            data={plantOptions}
            label={<HelpLabel {...fieldHelp("kioskDevice", "plant")} />}
            onChange={(v) => setCreateForm((s) => ({ ...s, plantId: v }))}
            placeholder="拠点を選択"
            searchable
            value={createForm.plantId}
            withAsterisk
          />
          <TextInput
            label={<HelpLabel {...fieldHelp("kioskDevice", "location")} />}
            onChange={(e) => {
              const location = e.currentTarget.value;
              setCreateForm((s) => ({ ...s, location }));
            }}
            placeholder="例: 検査室入口"
            value={createForm.location}
          />
        </Stack>
      </ModalShell>

      {/* 端末リンクモーダル */}
      <ModalShell
        confirmLabel="リンク"
        loading={isPending}
        onClose={() => {
          setLinkTarget(null);
          setLinkCode("");
        }}
        onConfirm={handleLink}
        opened={linkTarget != null}
        size="md"
        title={`端末リンク — ${linkTarget?.name ?? ""}`}
      >
        <Stack gap="sm">
          <Alert color="blue" variant="light">
            タブレットの設定画面（/setup）に表示された 12
            文字のコードを入力するか、QR をカメラでスキャンしてください。
            リンク後、この画面から有効化できます。
          </Alert>
          <TextInput
            label={<HelpLabel {...fieldHelp("kioskDevice", "linkCode")} />}
            onChange={(e) =>
              setLinkCode(normalizeCode(e.currentTarget.value).slice(0, 12))
            }
            placeholder="XXXX-XXXX-XXXX"
            styles={{
              input: { fontFamily: "var(--mantine-font-family-monospace)" },
            }}
            value={formatCode(linkCode)}
            withAsterisk
          />
          <LinkQrScanner onCode={setLinkCode} />
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
          <LocalizedTextInput
            help={fieldHelpTip("kioskDevice", "name")}
            jaProps={{
              value: editForm.nameJa,
              onChange: (v: string) =>
                setEditForm((s) => ({ ...s, nameJa: v })),
            }}
            label="端末名"
            required
            translationsProps={{
              value: editForm.nameTranslations,
              onChange: (v: Record<string, string>) =>
                setEditForm((s) => ({ ...s, nameTranslations: v })),
            }}
          />
          <Select
            data={plantOptions}
            label={<HelpLabel {...fieldHelp("kioskDevice", "plant")} />}
            onChange={(v) =>
              setEditForm((s) => ({
                ...s,
                plantId: v,
                // 拠点をまたぐ既定作業場所は成立しないのでクリアする。
                ...(v !== s.plantId ? { defaultWorkLocationId: null } : {}),
              }))
            }
            searchable
            value={editForm.plantId}
            withAsterisk
          />
          <TextInput
            label={<HelpLabel {...fieldHelp("kioskDevice", "location")} />}
            onChange={(e) => {
              const location = e.currentTarget.value;
              setEditForm((s) => ({ ...s, location }));
            }}
            value={editForm.location}
          />
          <Select
            clearable
            data={workLocationOptions.filter(
              (o) =>
                o.plantId == null || String(o.plantId) === editForm.plantId,
            )}
            description="工程の開始・再開時に、この端末からの作業実績へ自動で記録されます"
            label={
              <HelpLabel {...fieldHelp("kioskDevice", "defaultWorkLocation")} />
            }
            onChange={(v) =>
              setEditForm((s) => ({ ...s, defaultWorkLocationId: v }))
            }
            placeholder="機械・エリア（任意）"
            searchable
            value={editForm.defaultWorkLocationId}
          />
          <Text c="dimmed" size="xs">
            拠点を変更するとフロアマップ上のピン配置は解除されます。
          </Text>
        </Stack>
      </ModalShell>

      {/* 利用履歴モーダル */}
      <KioskDeviceLogsModal
        deviceId={logsTarget?.id ?? null}
        deviceName={logsTarget?.name ?? null}
        onClose={() => setLogsTarget(null)}
      />

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
