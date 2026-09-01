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
import { useTranslations } from "next-intl";
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
  const tr = useTranslations();
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
        {label ?? (online ? "オンライン" : tr("settings.kiosk.offline"))}
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
export function transportLabel(
  tr: ReturnType<typeof useTranslations>,
  transport: KioskPresenceTransport,
): string {
  if (transport === "ws") return tr("settings.kioskDevicesTable.liveWs");
  if (transport === "poll")
    return tr("settings.kioskDevicesTable.autoRefresh30S");
  return tr("settings.kioskDevicesTable.determinedFromActivityInThe");
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
  const tr = useTranslations();
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

  const handleCreate = () => {
    const plantId = Number(createForm.plantId);
    if (!createForm.nameJa.trim() || !plantId) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("settings.kiosk.theDeviceNameAndSiteAre"),
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
          title: tr("common.created"),
          message: tr("settings.kiosk.theDeviceProfileWasCreatedUse"),
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

  const openLink = (r: KioskDeviceRow) => {
    setLinkTarget(r);
    setLinkCode("");
  };

  const handleLink = () => {
    if (!linkTarget) return;
    const code = normalizeCode(linkCode);
    if (code.length !== 12) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("settings.kiosk.enterA12CharacterCode"),
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
          title: tr("common.linked"),
          message: tr("settings.kiosk.linkedYouCanEnableItNow"),
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
        title: tr("common.error2"),
        message: tr("settings.kiosk.theDeviceNameAndSiteAre"),
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
          title: tr("common.saved2"),
          message: tr("settings.kiosk.theDeviceInformationWasUpdated"),
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

  const columns: Column<KioskDeviceRow>[] = [
    {
      key: "name",
      header: tr("settings.kiosk.deviceName"),
      sortable: true,
      render: (r) => (
        <div>
          {r.name ? (
            <Text fw={500} size="sm" truncate>
              {r.name}
            </Text>
          ) : (
            <Text c="dimmed" size="sm">
              {tr("common.notSet")}
            </Text>
          )}
          {r.fingerprint && (
            <Tooltip
              label={tr("settings.kioskDevicesTable.attestationKey", {
                fingerprint: r.fingerprint,
              })}
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
      header: tr("common.location2"),
      hideable: true,
      render: (r) => (
        <Text c={r.location ? undefined : "dimmed"} size="sm" truncate>
          {r.location ?? "—"}
        </Text>
      ),
    },
    {
      key: "plant",
      header: tr("common.site"),
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
      header: tr("common.status"),
      width: 110,
      sortable: true,
      // PENDING=リンク待ち（灰）/ LINKED=有効化待ち（黄）— StatusBadge のマップ。
      render: (r) => <StatusBadge entity="KioskDevice" status={r.status} />,
      sortValue: (r) => r.status,
    },
    {
      // 所有区分（自動判定）。根拠の強さはバッジのツールチップに出る。
      key: "ownership",
      header: tr("common.deviceType"),
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
      header: tr("common.link"),
      width: 150,
      hideable: true,
      render: (r) => {
        if (r.status === "PENDING") {
          return (
            <Text c="dimmed" size="sm">
              {tr("settings.kiosk.notLinked")}
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
      header: tr("common.online"),
      width: 120,
      sortable: true,
      render: (r) =>
        r.status === "ACTIVE" ? (
          <Tooltip label={transportLabel(tr, transport)} withinPortal>
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
      header: tr("common.user2"),
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
      header: tr("common.lastActivity"),
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
      header: tr("settings.kiosk.enabledBy"),
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
        label: tr("settings.kiosk.linkTheDevice"),
        onAction: () => openLink(r),
      });
    }
    if (r.status === "LINKED") {
      actions.push({
        label: tr("common.enable"),
        onAction: () =>
          setConfirm({
            title: tr("settings.kiosk.confirmEnabling"),
            message: tr("settings.kioskDevicesTable.enableThisDeviceLinked", {
              linkedAt: r.linkedAt ? fmt.dateTime(r.linkedAt) : "—",
            }),
            confirmLabel: tr("common.enable"),
            confirmColor: "green",
            successMessage: tr("settings.kiosk.theDeviceWasEnabledItsScreen"),
            run: () => activateDevice(r.id),
          }),
      });
    }
    if (r.status !== "REVOKED") {
      actions.push({ label: tr("common.edit2"), onAction: () => openEdit(r) });
    }
    actions.push({
      label: tr("common.usageHistory"),
      onAction: () => setLogsTarget(r),
    });
    if (r.status === "ACTIVE") {
      actions.push({
        label: tr("common.disable"),
        color: "orange",
        onAction: () =>
          setConfirm({
            title: tr("common.confirmDisabling"),
            message: tr("settings.kiosk.temporarilyDisablesThisDeviceItCan"),
            confirmLabel: tr("common.disable"),
            run: () => disableDevice(r.id),
          }),
      });
    }
    if (r.status === "DISABLED") {
      actions.push({
        label: tr("settings.kiosk.reEnable"),
        onAction: () =>
          run(
            () => enableDevice(r.id),
            tr("settings.kiosk.theDeviceWasReEnabled"),
          ),
      });
    }
    if (r.fingerprint) {
      actions.push({
        label: tr("settings.kiosk.resetTheKey"),
        color: "orange",
        onAction: () =>
          setConfirm({
            title: tr("settings.kiosk.confirmResettingTheKey"),
            message: tr("settings.kiosk.releasesTheDeviceAppSAttestation"),
            confirmLabel: tr("settings.kiosk.resetTheKey"),
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
        label: tr("common.unlink"),
        color: "red",
        onAction: () =>
          setConfirm({
            title: tr("settings.kiosk.confirmUnlinking"),
            message: tr("settings.kiosk.unlinksThisDeviceSessionsTheDevice"),
            confirmLabel: tr("common.unlink"),
            successMessage: tr("settings.kiosk.unlinkedTheProfileIsOpenAgain"),
            run: () => unlinkDevice(r.id),
          }),
      });
    }
    if (r.status === "PENDING") {
      actions.push({
        label: tr("common.delete"),
        color: "red",
        onAction: () =>
          setConfirm({
            title: tr("common.confirmDeletion"),
            message: tr("settings.kiosk.deletesAnUnlinkedDeviceProfileThis"),
            confirmLabel: tr("common.delete"),
            successMessage: tr("settings.kiosk.theDeviceProfileWasDeleted"),
            run: () => deleteDeviceProfile(r.id),
          }),
      });
    } else if (r.status !== "REVOKED") {
      actions.push({
        label: tr("common.revoked2"),
        color: "red",
        onAction: () =>
          setConfirm({
            title: tr("common.confirmRevocation"),
            message: tr("settings.kiosk.revokesTheDeviceTheDeviceToken"),
            confirmLabel: tr("common.revoked2"),
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
            {isMobile ? "マップ" : tr("common.floorMap")}
          </SecondaryButton>
          <CreateButton
            loading={isPending}
            onClick={() => setCreateOpen(true)}
            style={{ flexShrink: 0 }}
          >
            {isMobile ? "作成" : tr("settings.kiosk.createADeviceProfile")}
          </CreateButton>
        </Group>
      }
      breadcrumbs={[tr("common.system"), tr("common.devices")]}
      filters={
        <>
          <Select
            clearable
            data={plantOptions}
            onChange={setPlant}
            placeholder={tr("common.site")}
            searchable
            style={isMobile ? { flex: 1 } : undefined}
            value={plant}
            w={isMobile ? undefined : 180}
          />
          <Select
            clearable
            data={statusOptions("KioskDevice")}
            onChange={setStatus}
            placeholder={tr("common.status")}
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
          placeholder={tr("settings.kiosk.deviceNameLocationSite")}
          value={search}
        />
      }
      title={tr("common.devices")}
    >
      <DataTable
        columns={columns}
        data={filtered}
        emptyIcon={<IconDeviceTablet size={28} />}
        emptyMessage={tr("settings.kiosk.thereAreNoSharedDevices")}
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
                {r.name ?? tr("common.notSet")}
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
        confirmLabel={tr("common.create2")}
        loading={isPending}
        onClose={() => setCreateOpen(false)}
        onConfirm={handleCreate}
        opened={createOpen}
        size="md"
        title={tr("settings.kiosk.createADeviceProfile")}
      >
        <Stack gap="sm">
          <Alert color="blue" variant="light">
            {tr("settings.kiosk.theProfileIsCreatedOpenAwaiting")}
          </Alert>
          <LocalizedTextInput
            help={fieldHelpTip("kioskDevice", "name")}
            jaProps={{
              value: createForm.nameJa,
              onChange: (e) => {
                const v = e.currentTarget.value;
                setCreateForm((s) => ({ ...s, nameJa: v }));
              },
            }}
            label={tr("settings.kiosk.deviceName")}
            placeholder={tr("settings.kiosk.eG1fMachiningAreaTablet")}
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
            placeholder={tr("common.selectASite")}
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
            placeholder={tr("settings.kiosk.eGInspectionRoomEntrance")}
            value={createForm.location}
          />
        </Stack>
      </ModalShell>

      {/* 端末リンクモーダル */}
      <ModalShell
        confirmLabel={tr("common.link")}
        loading={isPending}
        onClose={() => {
          setLinkTarget(null);
          setLinkCode("");
        }}
        onConfirm={handleLink}
        opened={linkTarget != null}
        size="md"
        title={tr("settings.kioskDevicesTable.deviceLinkName", {
          name: linkTarget?.name ?? "",
        })}
      >
        <Stack gap="sm">
          <Alert color="blue" variant="light">
            {tr("settings.kiosk.typeThe12CharacterCodeShown")}
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
        confirmLabel={tr("common.save2")}
        loading={isPending}
        onClose={() => setEditTarget(null)}
        onConfirm={handleEdit}
        opened={editTarget != null}
        size="md"
        title={tr("settings.kiosk.editTheDevice")}
      >
        <Stack gap="sm">
          <LocalizedTextInput
            help={fieldHelpTip("kioskDevice", "name")}
            jaProps={{
              value: editForm.nameJa,
              onChange: (e) => {
                const v = e.currentTarget.value;
                setEditForm((s) => ({ ...s, nameJa: v }));
              },
            }}
            label={tr("settings.kiosk.deviceName")}
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
            description={tr("settings.kiosk.itIsRecordedAutomaticallyOnWork")}
            label={
              <HelpLabel {...fieldHelp("kioskDevice", "defaultWorkLocation")} />
            }
            onChange={(v) =>
              setEditForm((s) => ({ ...s, defaultWorkLocationId: v }))
            }
            placeholder={tr("settings.kiosk.machineAreaOptional")}
            searchable
            value={editForm.defaultWorkLocationId}
          />
          <Text c="dimmed" size="xs">
            {tr("settings.kiosk.changingTheSiteRemovesItsPin")}
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
        confirmLabel={confirm?.confirmLabel ?? tr("common.run2")}
        loading={isPending}
        message={confirm?.message ?? ""}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) {
            run(confirm.run, confirm.successMessage ?? tr("common.done"));
          }
        }}
        opened={confirm != null}
        title={confirm?.title ?? ""}
      />
    </ListShell>
  );
}
