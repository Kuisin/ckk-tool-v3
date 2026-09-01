"use client";

/**
 * DisplaysTable — ディスプレイ一覧（SY09「ディスプレイ」タブ）。
 *
 * **共有端末タブと同じ作りにする。** 隣り合うタブなのに、片方は共通の
 * DataTable、もう片方は手書きの行（固定幅の Group を並べたもの）だった。
 * 見た目が違うだけでなく、狭い画面で列が潰れる・並べ替えができない・
 * 列の出し入れができない・ページ送りが無いという差も全部そこから来ていた。
 * DataTable に載せ替えたので、モバイルの 1 行 1 カード表示（design.md §8.1）も
 * 列設定の保存も、共有端末とまったく同じ挙動になる。
 *
 * 状態の言葉も StatusBadge の `DisplayDevice` に寄せた（同じ DB の値が
 * タブによって違う言葉で出ていた）。
 *
 * **登録は共有端末と同じ 3 段**: 作る（オープン）→ リンク → 有効化。
 * リンクコードは 12 桁で **QR も同じ形式**なので、スキャナも共用する
 * （LinkQrScanner）。以前ここだけ手入力しか無く、脚立の上のテレビに出た
 * 12 桁を読み上げてもらうことになっていた。
 *
 * オンライン判定はサーバー計算の初期値から始め、WS / ポーリングが繋がったら
 * そちらで上書きする（useDisplayPresence）。
 *
 * ★ **1 台で 2 枚出している機械は 1 行にまとめる。** Raspberry Pi 5 は HDMI が
 *   2 口あり、DB は 1 枚 = 1 行（映すものも倍率も画面ごと）だが、一覧に 2 行
 *   並ぶと「別々の機械が 2 台あるのか、1 台が 2 枚出しているのか」が読めない。
 *   行の中で「何枚目」を選ぶと、その画面の中身に切り替わる（lib/display-groups.ts）。
 */

import {
  Alert,
  Group,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDeviceTv, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  activateDisplay,
  createDisplayDevice,
  linkDisplayToProfile,
} from "@/app/(dashboard)/settings/kiosk-devices/displays/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { CreateButton } from "@/components/ui/buttons";
import {
  type Column,
  DataTable,
  type RowAction,
} from "@/components/ui/DataTable";
import { ModalShell } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import { formatCode, normalizeCode } from "@/lib/crockford";
import {
  groupByMachine,
  type MachineGroup,
  screenLabel,
} from "@/lib/display-groups";
import { DISPLAY_TEMPLATES } from "@/lib/display-templates";
import type { DisplayRow } from "@/lib/displays-admin";
import { statusOptions } from "@/lib/status-map";
import { OnlineDot } from "../kiosk/KioskDevicesTable";
import { LinkQrScanner } from "../kiosk/LinkQrScanner";
import {
  type DisplayPresenceEntry,
  useDisplayPresence,
} from "./useDisplayPresence";

/** 表に渡す 1 行 = 選ばれている画面 + その機械のまとめ。 */
type ViewRow = DisplayRow & { group: MachineGroup<DisplayRow> };

/**
 * 「何枚目を見るか」の選択。**行の中に置く**ので、押しても行の遷移
 * （詳細へ移動）を起こさないよう伝播を止める。
 */
function ScreenPicker({
  group,
  value,
  onPick,
}: {
  group: MachineGroup<DisplayRow>;
  value: string;
  onPick: (screenId: string) => void;
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 行クリック（遷移）を止めるためだけの覆い
    // biome-ignore lint/a11y/useKeyWithClickEvents: 中身のボタンが操作を担う
    <div onClick={(e) => e.stopPropagation()}>
      <SegmentedControl
        data={group.screens.map((screen, i) => ({
          value: screen.id,
          label: screenLabel(screen, i),
        }))}
        onChange={onPick}
        size="xs"
        value={value}
      />
    </div>
  );
}

/**
 * 新しい画面が最初に映すもの。**空にしない** — 設置の日に表示内容まで
 * 決まっていないことは普通にあり、そこで真っ黒な画面ができると
 * 「壊れている」と報告されてしまう。細かい設定は詳細画面で詰める。
 */
const DEFAULT_TEMPLATE = "production";

/** live なデータがあればそちらが勝つ。有効以外は常にオフライン扱い。 */
export function resolveOnline(
  row: DisplayRow,
  presence: ReadonlyMap<string, DisplayPresenceEntry>,
  live: boolean,
): boolean {
  if (row.status !== "ACTIVE") return false;
  if (live) return presence.get(row.id)?.isOnline ?? false;
  return row.initialOnline;
}

type Props = {
  rows: DisplayRow[];
  plantOptions: Array<{ value: string; label: string }>;
};

export function DisplaysTable({ rows, plantOptions }: Props) {
  const tr = useTr();
  const { presence, live } = useDisplayPresence();
  const isMobile = useIsMobile();
  const fmt = useFormat();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState<string | null>(null);
  const [plant, setPlant] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<DisplayRow | null>(null);
  // まとめた行ごとに「いま何枚目を見ているか」（キーは機械の識別子）
  const [shownScreen, setShownScreen] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = search?.trim().toLowerCase() ?? "";
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (plant && String(r.plantId ?? "") !== plant) return false;
      if (!q) return true;
      return [r.name, r.location, r.contentLabel, r.plantName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, plant, status]);

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    ok: string,
  ) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        notifications.show({
          title: tr("エラー"),
          message: result.error ?? tr("操作に失敗しました"),
          color: "red",
        });
        return;
      }
      notifications.show({ message: ok, color: "green" });
      setCreateOpen(false);
      setLinkTarget(null);
      router.refresh();
    });

  /**
   * 表に渡す行。まとめた機械は**選ばれている画面 1 枚**として振る舞い、
   * 名前の欄に「何枚目」の選択を添える。並べ替え・ページ送り・行の操作は
   * その画面に対して効く（DataTable 側は 1 行 = 1 画面のまま）。
   */
  const viewRows: ViewRow[] = useMemo(
    () =>
      groupByMachine(filtered).map((group) => {
        const chosen =
          group.screens.find(
            (x) => x.id === shownScreen[group.machineId ?? ""],
          ) ?? group.screens[0];
        return { ...chosen, group };
      }),
    [filtered, shownScreen],
  );

  const columns: Column<ViewRow>[] = [
    {
      key: "name",
      header: tr("ディスプレイ名"),
      sortable: true,
      render: (r) => (
        <Stack gap={4} style={{ minWidth: 0 }}>
          {r.name ? (
            <Text fw={500} size="sm" truncate>
              {r.name}
            </Text>
          ) : (
            <Text c="dimmed" size="sm">
              {tr("（未設定）")}
            </Text>
          )}
          {r.group.grouped && (
            <ScreenPicker
              group={r.group}
              onPick={(screenId: string) =>
                setShownScreen((prev) => ({
                  ...prev,
                  [r.group.machineId ?? ""]: screenId,
                }))
              }
              value={r.id}
            />
          )}
        </Stack>
      ),
      sortValue: (r) => r.name ?? "",
    },
    {
      key: "location",
      header: tr("場所"),
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
        <Text c={r.plantName ? undefined : "dimmed"} size="sm" truncate>
          {r.plantName ?? "—"}
        </Text>
      ),
      sortValue: (r) => r.plantName ?? "",
    },
    {
      key: "content",
      header: tr("表示内容"),
      sortable: true,
      render: (r) => (
        <Text size="sm" truncate>
          {r.contentLabel}
        </Text>
      ),
      sortValue: (r) => r.contentLabel,
    },
    {
      key: "status",
      header: tr("状態"),
      width: 110,
      sortable: true,
      render: (r) => <StatusBadge entity="DisplayDevice" status={r.status} />,
      sortValue: (r) => r.status,
    },
    {
      key: "online",
      header: tr("オンライン"),
      width: 120,
      sortable: true,
      render: (r) =>
        r.status === "ACTIVE" ? (
          <OnlineDot online={resolveOnline(r, presence, live)} />
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ),
      sortValue: (r) => (resolveOnline(r, presence, live) ? 0 : 1),
    },
    {
      key: "scalePercent",
      header: tr("表示倍率"),
      width: 100,
      align: "right",
      hideable: true,
      sortable: true,
      render: (r) => (
        <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
          {r.scalePercent}%
        </Text>
      ),
      sortValue: (r) => r.scalePercent,
    },
    {
      key: "lastSeenAt",
      header: tr("最終確認"),
      width: 160,
      hideable: true,
      sortable: true,
      render: (r) => (
        <Text c="dimmed" size="sm">
          {r.lastSeenAt ? fmt.dateTime(r.lastSeenAt) : "—"}
        </Text>
      ),
      sortValue: (r) => r.lastSeenAt?.toISOString() ?? "",
    },
  ];

  /**
   * 行の操作は**次にすべき 1 手だけ**（共有端末と同じ考え方）。
   * 有効になった後の操作は詳細画面に置く — 一覧から失効させない。
   */
  const rowActions = (r: ViewRow): RowAction<ViewRow>[] => {
    if (r.status === "PENDING") {
      return [
        { label: tr("ディスプレイをリンク"), onAction: () => setLinkTarget(r) },
      ];
    }
    if (r.status === "LINKED") {
      return [
        {
          label: tr("有効化"),
          onAction: () =>
            run(() => activateDisplay(r.id), tr("有効化しました")),
        },
      ];
    }
    return [];
  };

  return (
    <>
      <ListShell
        action={
          <CreateButton
            loading={pending}
            onClick={() => setCreateOpen(true)}
            style={{ flexShrink: 0 }}
          >
            {isMobile ? "作成" : tr("ディスプレイを追加")}
          </CreateButton>
        }
        breadcrumbs={[tr("システム"), tr("端末管理")]}
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
              data={statusOptions("DisplayDevice")}
              onChange={setStatus}
              placeholder={tr("状態")}
              style={isMobile ? { flex: 1 } : undefined}
              value={status}
              w={isMobile ? undefined : 140}
            />
          </>
        }
        onReset={() => {
          setSearch(null);
          setPlant(null);
          setStatus(null);
        }}
        search={
          <TextInput
            leftSection={<IconSearch size={14} />}
            onChange={(e) => setSearch(e.currentTarget.value || null)}
            placeholder={tr("名前 / 場所 / 表示内容...")}
            value={search ?? ""}
          />
        }
        title={tr("端末管理")}
      >
        <DataTable
          columns={columns}
          data={viewRows}
          emptyIcon={<IconDeviceTv size={28} />}
          emptyMessage={
            rows.length === 0
              ? tr(
                  tr(
                    tr(
                      "ディスプレイがありません。「ディスプレイを追加」で作ってから、テレビに出るリンクコードで結びます",
                    ),
                  ),
                )
              : tr("条件に一致するディスプレイがありません")
          }
          getRowId={(r) => r.id}
          onRowClick={(r) =>
            router.push(`/settings/kiosk-devices/displays/${r.id}`)
          }
          renderCard={(r) => (
            <Stack gap={3} style={{ minWidth: 0 }}>
              <Text fw={600} size="sm" truncate>
                {r.name ?? tr("（未設定）")}
              </Text>
              {/* 何枚目かの選択は携帯でも要る（1 台 2 枚の機械が 1 枚に見える） */}
              {r.group.grouped && (
                <ScreenPicker
                  group={r.group}
                  onPick={(screenId: string) =>
                    setShownScreen((prev) => ({
                      ...prev,
                      [r.group.machineId ?? ""]: screenId,
                    }))
                  }
                  value={r.id}
                />
              )}
              <Text c="dimmed" size="xs" truncate>
                {[r.plantName, r.location].filter(Boolean).join(" / ") || "—"}
              </Text>
              <Group gap="xs" wrap="wrap">
                <StatusBadge entity="DisplayDevice" status={r.status} />
                {r.status === "ACTIVE" && (
                  <OnlineDot online={resolveOnline(r, presence, live)} />
                )}
                <Text c="dimmed" size="xs" truncate>
                  {r.contentLabel}
                </Text>
              </Group>
              <Text c="dimmed" size="xs">
                最終確認 {r.lastSeenAt ? fmt.dateTime(r.lastSeenAt) : "—"}
              </Text>
            </Stack>
          )}
          rowActions={rowActions}
        />
      </ListShell>

      <CreateDisplayModal
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) =>
          run(() => createDisplayDevice(values), tr("作成しました"))
        }
        opened={createOpen}
        pending={pending}
        plantOptions={plantOptions}
      />

      <LinkDisplayModal
        display={linkTarget}
        onClose={() => setLinkTarget(null)}
        onSubmit={(code) => {
          if (linkTarget) {
            run(
              () => linkDisplayToProfile(linkTarget.id, code),
              tr("リンクしました"),
            );
          }
        }}
        pending={pending}
      />
    </>
  );
}

// ── 追加（ハードウェアより先に作る） ────────────────────────────────────────

function CreateDisplayModal({
  opened,
  onClose,
  onSubmit,
  pending,
  plantOptions,
}: {
  opened: boolean;
  onClose: () => void;
  onSubmit: (values: {
    nameJa: string;
    location?: string;
    plantId?: number | null;
    contentType: "APP_PAGE";
    contentConfig: unknown;
  }) => void;
  pending: boolean;
  plantOptions: Array<{ value: string; label: string }>;
}) {
  const tr = useTr();
  const [nameJa, setNameJa] = useState("");
  const [location, setLocation] = useState("");
  const [plantId, setPlantId] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState<string>(DEFAULT_TEMPLATE);

  return (
    <ModalShell
      confirmDisabled={!nameJa.trim()}
      confirmLabel={tr("作成")}
      loading={pending}
      onClose={onClose}
      onConfirm={() =>
        onSubmit({
          nameJa,
          location: location || undefined,
          plantId: plantId ? Number(plantId) : null,
          contentType: "APP_PAGE",
          // 設定は既定のまま作る（詳細画面で詰める）
          contentConfig: { page: templateKey, options: {} },
        })
      }
      opened={opened}
      size="md"
      title={tr("ディスプレイを追加")}
    >
      <Stack gap="sm">
        <Alert color="blue" variant="light">
          {tr(
            tr(
              tr(
                "オープン（リンク待ち）で作成されます。テレビの画面に出るリンクコードを\n          「ディスプレイをリンク」で読み取ってリンクした後、この画面から\n          有効化できます（共有端末と同じ手順です）。",
              ),
            ),
          )}
        </Alert>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            description={tr("現場の人が呼ぶ名前")}
            label={tr("名前")}
            onChange={(e) => setNameJa(e.currentTarget.value)}
            placeholder={tr("例: A ライン 入口")}
            value={nameJa}
            withAsterisk
          />
          <TextInput
            label={tr("設置場所")}
            onChange={(e) => setLocation(e.currentTarget.value)}
            placeholder={tr("例: 1F 加工エリア")}
            value={location}
          />
          <Select
            clearable
            data={plantOptions}
            label="拠点"
            onChange={setPlantId}
            placeholder={tr("選択してください")}
            searchable
            value={plantId}
          />
          <Select
            data={DISPLAY_TEMPLATES.map((t) => ({
              value: t.key,
              label: t.label,
            }))}
            description={tr("あとから詳細画面で変更・調整できます")}
            label={tr("映す画面")}
            onChange={(v) => setTemplateKey(v ?? DEFAULT_TEMPLATE)}
            value={templateKey}
          />
        </SimpleGrid>
      </Stack>
    </ModalShell>
  );
}

// ── リンク（テレビに出ているコードを読む） ──────────────────────────────────

function LinkDisplayModal({
  display,
  onClose,
  onSubmit,
  pending,
}: {
  display: DisplayRow | null;
  onClose: () => void;
  onSubmit: (code: string) => void;
  pending: boolean;
}) {
  const tr = useTr();
  const [code, setCode] = useState("");

  return (
    <ModalShell
      confirmDisabled={code.length !== 12}
      confirmLabel={tr("リンク")}
      loading={pending}
      onClose={onClose}
      onConfirm={() => onSubmit(code)}
      opened={display !== null}
      size="md"
      title={`ディスプレイをリンク: ${display?.name ?? ""}`}
    >
      <Stack gap="sm">
        <Text c="dimmed" size="sm">
          {tr(
            tr(
              tr(
                "テレビの画面に出ている QR を読み取るか、12 文字のリンクコードを\n          入力してください。共有端末と同じ形式です。",
              ),
            ),
          )}
        </Text>
        {/* 読み取れたらそのままリンクまで進める（脚立の上で読み上げさせない） */}
        <LinkQrScanner
          label={tr("ディスプレイのQRをスキャン")}
          onCode={(scanned) => {
            setCode(scanned);
            onSubmit(scanned);
          }}
        />
        <TextInput
          label={tr("リンクコード")}
          onChange={(e) =>
            setCode(normalizeCode(e.currentTarget.value).slice(0, 12))
          }
          placeholder="ABCD-EFGH-JKLM"
          styles={{ input: { fontFamily: "monospace", fontSize: 18 } }}
          value={formatCode(code)}
        />
      </Stack>
    </ModalShell>
  );
}
