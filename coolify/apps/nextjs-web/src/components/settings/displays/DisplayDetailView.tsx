"use client";

/**
 * DisplayDetailView — ディスプレイ 1 台の詳細。
 *
 * 「いま何を映していて、生きているか」を上に、素性と履歴を下に。
 * **何を映すかはこの画面だけが決める**（共有の「表示内容」レコードは無い）。
 * 保存を押した瞬間に壁の画面が変わる（サーバーアクションが合図を送る）。
 *
 * 表示内容タブは EditablePanel（design.md §10.10）— 既定は閲覧で、押して
 * 編集に入る。読みに来ただけの人に編集フォームを開いて見せない。
 */

import {
  Alert,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconForbid,
  IconPlayerPause,
  IconTrash,
  IconUnlink,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  activateDisplay,
  deleteDisplay,
  revokeDisplay,
  setDisplayEnabled,
  unlinkDisplay,
  updateDisplay,
} from "@/app/(dashboard)/settings/kiosk-devices/displays/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { AppTabs } from "@/components/ui/AppTabs";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { FieldValue } from "@/components/ui/FieldValue";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  AuditTimeline,
  FormActions,
  type MenuItemDef,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import type { DisplayDetail } from "@/lib/displays-admin";
import { OnlineDot } from "../kiosk/KioskDevicesTable";
import {
  DisplayContentEditor,
  DisplayContentView,
} from "./DisplayContentEditor";
import { useDisplayPresence } from "./useDisplayPresence";

type Props = {
  display: DisplayDetail;
  plantOptions: Array<{ value: string; label: string }>;
  audit: AuditEntry[];
  /** 同じ機械の画面（1 台 2 枚のとき。1 枚運用では空）。 */
  machineScreens?: Array<{
    id: string;
    name: string | null;
    screenIndex: number | null;
  }>;
};

export function DisplayDetailView({
  display,
  plantOptions,
  audit,
  machineScreens = [],
}: Props) {
  const tr = useTr();
  const router = useRouter();
  const fmt = useFormat();
  const { presence, live } = useDisplayPresence();
  const [pending, startTransition] = useTransition();

  const [nameJa, setNameJa] = useState(
    display.nameJson?.ja ?? display.name ?? "",
  );
  const [location, setLocation] = useState(display.location ?? "");
  const [plantId, setPlantId] = useState<string | null>(
    display.plantId ? String(display.plantId) : null,
  );
  const [scalePercent, setScalePercent] = useState(display.scalePercent);

  const online =
    display.status === "ACTIVE" &&
    (live
      ? (presence.get(display.id)?.isOnline ?? false)
      : display.initialOnline);

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMessage: string,
    after?: () => void,
  ) => {
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
      notifications.show({ message: successMessage, color: "green" });
      after ? after() : router.refresh();
    });
  };

  /** 保存 → 成功したら閲覧へ戻す（§10.10）。 */
  const save = (onSaved?: () => void) =>
    run(
      () =>
        updateDisplay({
          id: display.id,
          nameJa,
          location,
          plantId: plantId ? Number(plantId) : null,
          scalePercent,
        }),
      tr("保存しました"),
      () => {
        onSaved?.();
        router.refresh();
      },
    );

  const confirmRevoke = () =>
    modals.openConfirmModal({
      title: tr("ディスプレイの失効"),
      children: (
        <Text size="sm">
          {tr(
            tr(
              tr(
                "この画面を締め出します。次の再読込で登録画面に戻り、以後は何も映りません。\n          もう一度使うには、現地で出る QR を読み取って登録し直してください。",
              ),
            ),
          )}
        </Text>
      ),
      labels: { confirm: tr("失効させる"), cancel: tr("戻る") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        run(() => revokeDisplay(display.id), tr("失効させました")),
    });

  /**
   * 主ボタンに出す「次にすべき 1 手」。状態ごとに 1 つだけ
   * （共有端末の一覧と同じ考え方 — 選べる操作を並べるほど、何をすべきかが
   *   かえって読めなくなる）。無ければボタンごと出さない。
   */
  const primaryAction =
    display.status === "LINKED"
      ? {
          label: tr("有効化"),
          run: () =>
            run(() => activateDisplay(display.id), tr("有効化しました")),
        }
      : display.status === "DISABLED"
        ? {
            label: tr("再開"),
            run: () =>
              run(
                () => setDisplayEnabled(display.id, true),
                tr("再開しました"),
              ),
          }
        : null;

  const menuItems: MenuItemDef[] = [
    ...(display.status === "ACTIVE"
      ? [
          {
            label: "一時停止",
            icon: <IconPlayerPause size={14} />,
            onClick: () =>
              run(
                () => setDisplayEnabled(display.id, false),
                tr("一時停止しました"),
              ),
          },
        ]
      : []),
    ...(display.status !== "PENDING" && display.status !== "REVOKED"
      ? [
          {
            label: tr("リンク解除"),
            icon: <IconUnlink size={14} />,
            onClick: () =>
              run(() => unlinkDisplay(display.id), tr("リンクを解除しました")),
          },
        ]
      : []),
    display.status === "REVOKED" || display.status === "PENDING"
      ? {
          label: "削除",
          icon: <IconTrash size={14} />,
          color: "red",
          divider: true,
          onClick: () => confirmDelete(),
        }
      : {
          label: tr("失効"),
          icon: <IconForbid size={14} />,
          color: "red",
          divider: true,
          onClick: () => confirmRevoke(),
        },
  ];

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: tr("ディスプレイの削除"),
      children: <Text size="sm">{tr("この操作は取り消せません。")}</Text>,
      labels: { confirm: "削除", cancel: tr("戻る") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        run(
          () => deleteDisplay(display.id),
          tr("削除しました"),
          () => router.push("/settings/kiosk-devices"),
        ),
    });

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          /* 操作は ResourceActions に預ける — 狭い画面では 5 つのボタンが
             折り返して題名を押し出していた。モバイルでは ⋯ に畳まれる
             （design.md §20.2）。「次にすべき 1 手」だけを主ボタンに出し、
             残りはメニューへ。 */
          <ResourceActions
            editLabel={primaryAction?.label ?? ""}
            menuItems={menuItems}
            onEdit={primaryAction?.run}
          />
        }
        breadcrumbs={[
          tr("システム"),
          tr("端末管理"),
          display.name ?? tr("ディスプレイ詳細"),
        ]}
        status={<StatusBadge entity="DisplayDevice" status={display.status} />}
        title={display.name ?? tr("（名称未設定）")}
      />

      {display.status === "PENDING" && (
        <Alert color="gray">
          {tr(
            tr(
              tr(
                "このプロファイルはまだ画面と結びついていません。ディスプレイの画面に\n          出ているリンクコードを、一覧の「リンク」から入力してください。",
              ),
            ),
          )}
        </Alert>
      )}
      {display.status === "LINKED" && (
        <Alert color="yellow">
          {tr("画面とリンクしました。「有効化」を押すと表示を開始します。")}
        </Alert>
      )}
      {display.status === "REVOKED" && (
        <Alert color="red">
          {tr(
            tr(
              tr(
                "このディスプレイは失効しています。もう一度使うには、現地の画面に出る\n          リンクコードで登録し直してください。",
              ),
            ),
          )}
        </Alert>
      )}

      {/* 1 台で 2 枚出している機械は、ここでもう一方へ行ける。一覧と同じで
          「別々の機械が 2 台」ではなく「1 台が 2 枚」だと分かるようにする。 */}
      {machineScreens.length > 1 && (
        <Group gap="sm" wrap="nowrap">
          <Text c="dimmed" size="sm">
            {tr("この機械の画面")}
          </Text>
          <SegmentedControl
            data={machineScreens.map((screen, i) => ({
              value: screen.id,
              label: tr("{v0} 枚目", { v0: screen.screenIndex ?? i + 1 }),
            }))}
            onChange={(id) => {
              if (id !== display.id) {
                router.push(`/settings/kiosk-devices/displays/${id}`);
              }
            }}
            size="sm"
            value={display.id}
          />
        </Group>
      )}

      {/* サマリ（端末詳細と同じ 3 列）。状態は見出しのバッジ、オンラインは
          別の軸なのでここに置く。 */}
      <Paper p="md" radius="md" withBorder>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <FieldValue
            label={tr("オンライン")}
            value={
              display.status === "ACTIVE" ? <OnlineDot online={online} /> : "—"
            }
          />
          <FieldValue
            label={tr("最終確認")}
            value={display.lastSeenAt ? fmt.dateTime(display.lastSeenAt) : "—"}
          />
          <FieldValue label="拠点" value={display.plantName ?? "—"} />
          <FieldValue label={tr("設置場所")} value={display.location ?? "—"} />
          <FieldValue label={tr("表示内容")} value={display.contentLabel} />
          <FieldValue
            label={tr("リンク")}
            value={display.linkedAt ? fmt.dateTime(display.linkedAt) : "—"}
          />
          <FieldValue
            label={tr("有効化")}
            value={
              display.activatedAt
                ? `${fmt.dateTime(display.activatedAt)}${
                    display.activatedByName
                      ? `（${display.activatedByName}）`
                      : ""
                  }`
                : "—"
            }
          />
          <FieldValue
            label={tr("登録の期限")}
            value={
              display.deviceTokenExpiresAt
                ? fmt.dateTime(display.deviceTokenExpiresAt)
                : "—"
            }
          />
          <FieldValue
            label={tr("つないでいる機械")}
            value={
              display.machineId
                ? `${display.machineId}${
                    display.screenIndex ? ` / ${display.screenIndex} 枚目` : ""
                  }`
                : "—"
            }
          />
          <FieldValue
            label={tr("最後に見た IP アドレス")}
            value={display.lastIpAddress ?? "—"}
          />
          <FieldValue
            label={tr("アプリのバージョン")}
            value={display.appVersion ?? "—"}
          />
          <FieldValue
            label={tr("作成日時")}
            value={fmt.dateTime(display.createdAt)}
          />
          <FieldValue
            fullWidth
            label={tr("ブラウザ")}
            value={display.userAgent ?? "—"}
          />
        </SimpleGrid>
      </Paper>

      {/* タブは共有端末の詳細と同じ構成（design.md §8.2 — 詳細画面は
          サマリ + Tabs）。**タブの中に Paper を置かない** — パネル自体が
          中身の領域なので、置くとカードが入れ子になる。見出しもタブ名と
          重複するので出さない。 */}
      <AppTabs defaultValue="content">
        <Tabs.List>
          <Tabs.Tab value="content">{tr("表示内容")}</Tabs.Tab>
          <Tabs.Tab value="settings">{tr("設定")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("履歴")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="content">
          <EditablePanel
            canEdit={display.status !== "REVOKED"}
            description={tr(
              "保存すると、この画面の表示がその場で切り替わります。",
            )}
            edit={({ close }) => (
              <DisplayContentEditor
                display={display}
                onDone={close}
                plantOptions={plantOptions}
              />
            )}
            title={tr("映すもの")}
            view={
              <DisplayContentView
                display={display}
                plantOptions={plantOptions}
              />
            }
          />
        </Tabs.Panel>

        {/* ★ 既定は閲覧、押して編集（design.md §10.10 の全画面共通の決まり）。
            詳細画面に生のフォームを置かない — 読みに来た人には
            「いま何が設定されているか」が要るのであって、入力欄ではない。 */}
        <Tabs.Panel keepMounted={false} pt="md" value="settings">
          <EditablePanel
            canEdit={display.status !== "REVOKED"}
            edit={({ close }) => (
              <Stack gap="md">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <TextInput
                    label={tr("ディスプレイの名前")}
                    onChange={(e) => setNameJa(e.currentTarget.value)}
                    value={nameJa}
                    withAsterisk
                  />
                  <TextInput
                    label={tr("設置場所")}
                    onChange={(e) => setLocation(e.currentTarget.value)}
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
                </SimpleGrid>
                <ScaleField onChange={setScalePercent} value={scalePercent} />
                {/* 保存に成功したら閲覧へ戻す。キャンセルも同じ close。 */}
                <FormActions
                  loading={pending}
                  onCancel={close}
                  onSave={() => save(close)}
                />
              </Stack>
            )}
            title={tr("この画面の設定")}
            view={
              <SummaryGrid cols={2}>
                <FieldValue
                  label={tr("ディスプレイの名前")}
                  value={display.name ?? "—"}
                />
                <FieldValue
                  label={tr("設置場所")}
                  value={display.location ?? "—"}
                />
                <FieldValue label="拠点" value={display.plantName ?? "—"} />
                <FieldValue
                  label={tr("表示倍率")}
                  value={`${display.scalePercent}%`}
                />
              </SummaryGrid>
            }
          />
        </Tabs.Panel>

        <Tabs.Panel keepMounted={false} pt="md" value="history">
          <AuditTimeline entries={audit} />
        </Tabs.Panel>
      </AppTabs>
    </Stack>
  );
}

/**
 * 表示倍率の入力。
 *
 * **画面の大きさと見る距離に合わせる微調整**なので、数値を打たせるより
 * 「小さめ / 標準 / 大きめ」を押して、必要なら細かく動かせる形にする。
 * 現場の管理者は「何 % が正解か」を知らないし、知る必要もない —
 * 壁を見ながら合わせるものだから。
 */
function ScaleField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const tr = useTr();
  // よく使う 3 つ。ここに無い値のときは選択なしにして、スライダーだけ効かせる
  const PRESETS = [
    { value: "85", label: tr("小さめ") },
    { value: "100", label: tr("標準") },
    { value: "125", label: tr("大きめ") },
  ];
  const preset = PRESETS.some((p) => p.value === String(value))
    ? String(value)
    : "";

  return (
    <Stack gap="xs">
      <Text fw={500} size="sm">
        {tr("表示倍率")}
      </Text>
      <Text c="dimmed" size="xs">
        {tr(
          tr(
            tr(
              "画面の大きさと、どのくらい離れて見るかに合わせて調整します。\n        大きくすると 1 画面に入る件数は減り、あふれた分はページ送りになります。",
            ),
          ),
        )}
      </Text>
      <SegmentedControl
        data={PRESETS}
        onChange={(v) => onChange(Number(v))}
        value={preset}
      />
      <Slider
        label={(v) => `${v}%`}
        marks={[
          { value: 50, label: "50%" },
          { value: 100, label: "100%" },
          { value: 150, label: "150%" },
          { value: 200, label: "200%" },
        ]}
        max={200}
        mb="lg"
        min={50}
        onChange={onChange}
        step={5}
        value={value}
      />
    </Stack>
  );
}
