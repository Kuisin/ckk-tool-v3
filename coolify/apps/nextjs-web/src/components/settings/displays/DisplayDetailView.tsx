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
import { useTranslations } from "next-intl";
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
import type { DisplayDetail } from "@/lib/displays-admin";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n";
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
  const tr = useTranslations();
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
  const [locale, setLocale] = useState<string | null>(display.locale);

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
          title: tr("common.error2"),
          message: result.error ?? tr("common.theActionFailed"),
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
          locale,
        }),
      tr("common.saved2"),
      () => {
        onSaved?.();
        router.refresh();
      },
    );

  const confirmRevoke = () =>
    modals.openConfirmModal({
      title: tr("settings.displays.revokeADisplay"),
      children: (
        <Text size="sm">{tr("settings.displays.locksThisScreenOutAtThe")}</Text>
      ),
      labels: {
        confirm: tr("settings.displays.revoke"),
        cancel: tr("common.back2"),
      },
      confirmProps: { color: "red" },
      onConfirm: () =>
        run(() => revokeDisplay(display.id), tr("common.revoked")),
    });

  /**
   * 主ボタンに出す「次にすべき 1 手」。状態ごとに 1 つだけ
   * （共有端末の一覧と同じ考え方 — 選べる操作を並べるほど、何をすべきかが
   *   かえって読めなくなる）。無ければボタンごと出さない。
   */
  const primaryAction =
    display.status === "LINKED"
      ? {
          label: tr("common.enable"),
          run: () =>
            run(() => activateDisplay(display.id), tr("common.enabled2")),
        }
      : display.status === "DISABLED"
        ? {
            label: tr("common.resume"),
            run: () =>
              run(
                () => setDisplayEnabled(display.id, true),
                tr("settings.displays.resumed"),
              ),
          }
        : null;

  const menuItems: MenuItemDef[] = [
    ...(display.status === "ACTIVE"
      ? [
          {
            label: tr("settings.displayDetailView.pause"),
            icon: <IconPlayerPause size={14} />,
            onClick: () =>
              run(
                () => setDisplayEnabled(display.id, false),
                tr("settings.displays.suspended"),
              ),
          },
        ]
      : []),
    ...(display.status !== "PENDING" && display.status !== "REVOKED"
      ? [
          {
            label: tr("common.unlink"),
            icon: <IconUnlink size={14} />,
            onClick: () =>
              run(() => unlinkDisplay(display.id), tr("common.unlinked")),
          },
        ]
      : []),
    display.status === "REVOKED" || display.status === "PENDING"
      ? {
          label: tr("common.delete"),
          icon: <IconTrash size={14} />,
          color: "red",
          divider: true,
          onClick: () => confirmDelete(),
        }
      : {
          label: tr("common.revoke2"),
          icon: <IconForbid size={14} />,
          color: "red",
          divider: true,
          onClick: () => confirmRevoke(),
        },
  ];

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: tr("settings.displays.deleteTheDisplay"),
      children: (
        <Text size="sm">{tr("settings.displays.thisCannotBeUndone")}</Text>
      ),
      labels: { confirm: tr("common.delete"), cancel: tr("common.back2") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        run(
          () => deleteDisplay(display.id),
          tr("common.deleted"),
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
          tr("common.system"),
          tr("common.devices"),
          display.name ?? tr("settings.displays.displayDetails"),
        ]}
        status={<StatusBadge entity="DisplayDevice" status={display.status} />}
        title={display.name ?? tr("common.unnamed")}
      />

      {display.status === "PENDING" && (
        <Alert color="gray">
          {tr("settings.displays.thisProfileIsNotTiedTo")}
        </Alert>
      )}
      {display.status === "LINKED" && (
        <Alert color="yellow">
          {tr("settings.displays.linkedToTheScreenPressEnable")}
        </Alert>
      )}
      {display.status === "REVOKED" && (
        <Alert color="red">
          {tr("settings.displays.thisDisplayHasBeenRevokedTo")}
        </Alert>
      )}

      {/* 1 台で 2 枚出している機械は、ここでもう一方へ行ける。一覧と同じで
          「別々の機械が 2 台」ではなく「1 台が 2 枚」だと分かるようにする。 */}
      {machineScreens.length > 1 && (
        <Group gap="sm" wrap="nowrap">
          <Text c="dimmed" size="sm">
            {tr("settings.displays.screenForThisMachine")}
          </Text>
          <SegmentedControl
            data={machineScreens.map((screen, i) => ({
              value: screen.id,
              label: tr("settings.displayDetailView.screenNumber", {
                n: screen.screenIndex ?? i + 1,
              }),
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
            label={tr("common.online")}
            value={
              display.status === "ACTIVE" ? <OnlineDot online={online} /> : "—"
            }
          />
          <FieldValue
            label={tr("common.lastChecked")}
            value={display.lastSeenAt ? fmt.dateTime(display.lastSeenAt) : "—"}
          />
          <FieldValue
            label={tr("common.site")}
            value={display.plantName ?? "—"}
          />
          <FieldValue
            label={tr("common.location")}
            value={display.location ?? "—"}
          />
          <FieldValue
            label={tr("common.whatToShow2")}
            value={display.contentLabel}
          />
          <FieldValue
            label={tr("common.link")}
            value={display.linkedAt ? fmt.dateTime(display.linkedAt) : "—"}
          />
          <FieldValue
            label={tr("common.enable")}
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
            label={tr("settings.displays.registrationDeadline")}
            value={
              display.deviceTokenExpiresAt
                ? fmt.dateTime(display.deviceTokenExpiresAt)
                : "—"
            }
          />
          <FieldValue
            label={tr("settings.displays.connectedMachine")}
            value={
              display.machineId
                ? `${display.machineId}${
                    display.screenIndex
                      ? ` / ${tr("settings.displayDetailView.screenNumber", {
                          n: display.screenIndex,
                        })}`
                      : ""
                  }`
                : "—"
            }
          />
          <FieldValue
            label={tr("settings.displays.lastIpAddressSeen")}
            value={display.lastIpAddress ?? "—"}
          />
          <FieldValue
            label={tr("settings.displays.appVersion")}
            value={display.appVersion ?? "—"}
          />
          <FieldValue
            label={tr("common.created2")}
            value={fmt.dateTime(display.createdAt)}
          />
          <FieldValue
            fullWidth
            label={tr("settings.displays.browser")}
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
          <Tabs.Tab value="content">{tr("common.whatToShow2")}</Tabs.Tab>
          <Tabs.Tab value="settings">{tr("common.settings")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="content">
          <EditablePanel
            canEdit={display.status !== "REVOKED"}
            description={tr(
              "settings.displays.savingSwitchesWhatThisScreenShows",
            )}
            edit={({ close }) => (
              <DisplayContentEditor
                display={display}
                onDone={close}
                plantOptions={plantOptions}
              />
            )}
            title={tr("common.whatToShow")}
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
                    label={tr("settings.displays.displayName")}
                    onChange={(e) => setNameJa(e.currentTarget.value)}
                    value={nameJa}
                    withAsterisk
                  />
                  <TextInput
                    label={tr("common.location")}
                    onChange={(e) => setLocation(e.currentTarget.value)}
                    value={location}
                  />
                  <Select
                    clearable
                    data={plantOptions}
                    label={tr("common.site")}
                    onChange={setPlantId}
                    placeholder={tr("common.selectOne")}
                    searchable
                    value={plantId}
                  />
                </SimpleGrid>
                <ScaleField onChange={setScalePercent} value={scalePercent} />
                <Select
                  clearable
                  data={LOCALES.map((l) => ({
                    value: l,
                    label: LOCALE_LABELS[l],
                  }))}
                  description={tr(
                    "settings.displays.displayLanguageDescription",
                  )}
                  label={tr("settings.displays.displayLanguage")}
                  onChange={setLocale}
                  placeholder={tr("settings.displays.displayLanguageDefault")}
                  value={locale}
                />
                {/* 保存に成功したら閲覧へ戻す。キャンセルも同じ close。 */}
                <FormActions
                  loading={pending}
                  onCancel={close}
                  onSave={() => save(close)}
                />
              </Stack>
            )}
            title={tr("settings.displays.settingsForThisScreen")}
            view={
              <SummaryGrid cols={2}>
                <FieldValue
                  label={tr("settings.displays.displayName")}
                  value={display.name ?? "—"}
                />
                <FieldValue
                  label={tr("common.location")}
                  value={display.location ?? "—"}
                />
                <FieldValue
                  label={tr("common.site")}
                  value={display.plantName ?? "—"}
                />
                <FieldValue
                  label={tr("common.zoom")}
                  value={`${display.scalePercent}%`}
                />
                <FieldValue
                  label={tr("settings.displays.displayLanguage")}
                  value={
                    display.locale
                      ? LOCALE_LABELS[
                          display.locale as (typeof LOCALES)[number]
                        ]
                      : tr("settings.displays.displayLanguageDefault")
                  }
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
  const tr = useTranslations();
  // よく使う 3 つ。ここに無い値のときは選択なしにして、スライダーだけ効かせる
  const PRESETS = [
    { value: "85", label: tr("settings.displays.smaller") },
    { value: "100", label: tr("settings.displays.default") },
    { value: "125", label: tr("settings.displays.larger") },
  ];
  const preset = PRESETS.some((p) => p.value === String(value))
    ? String(value)
    : "";

  return (
    <Stack gap="xs">
      <Text fw={500} size="sm">
        {tr("common.zoom")}
      </Text>
      <Text c="dimmed" size="xs">
        {tr("settings.displays.adjustItToTheScreenSize")}
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
