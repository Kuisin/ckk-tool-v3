"use client";

/**
 * DisplayDetailView — ディスプレイ 1 台の詳細。
 *
 * 「いま何を映していて、生きているか」を上に、素性と履歴を下に。
 * 表示内容の切替はここが主戦場なので、保存を押した瞬間に壁の画面が
 * 変わる（サーバーアクションが合図を送る）。
 */

import {
  Alert,
  Badge,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
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
import { DangerButton, SecondaryButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  type AuditEntry,
  AuditTimeline,
  FormActions,
  SummaryGrid,
} from "@/components/ui/shells";
import type { DisplayDetail } from "@/lib/displays-admin";
import { useDisplayPresence } from "./useDisplayPresence";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING: { label: "リンク待ち", color: "gray" },
  LINKED: { label: "有効化待ち", color: "yellow" },
  ACTIVE: { label: "有効", color: "green" },
  DISABLED: { label: "一時停止", color: "gray" },
  REVOKED: { label: "失効", color: "red" },
};

type Props = {
  display: DisplayDetail;
  profiles: Array<{ id: string; name: string }>;
  plantOptions: Array<{ value: string; label: string }>;
  audit: AuditEntry[];
};

export function DisplayDetailView({
  display,
  profiles,
  plantOptions,
  audit,
}: Props) {
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
  const [profileId, setProfileId] = useState<string | null>(display.profileId);
  const [scalePercent, setScalePercent] = useState(display.scalePercent);

  const online =
    display.status === "ACTIVE" &&
    (live
      ? (presence.get(display.id)?.isOnline ?? false)
      : display.initialOnline);
  const status = STATUS_LABEL[display.status] ?? STATUS_LABEL.ACTIVE;

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMessage: string,
    after?: () => void,
  ) => {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        notifications.show({
          title: "エラー",
          message: result.error ?? "操作に失敗しました",
          color: "red",
        });
        return;
      }
      notifications.show({ message: successMessage, color: "green" });
      after ? after() : router.refresh();
    });
  };

  const save = () =>
    run(
      () =>
        updateDisplay({
          id: display.id,
          nameJa,
          location,
          plantId: plantId ? Number(plantId) : null,
          profileId,
          scalePercent,
        }),
      "保存しました",
    );

  const confirmRevoke = () =>
    modals.openConfirmModal({
      title: "ディスプレイの失効",
      children: (
        <Text size="sm">
          この画面を締め出します。次の再読込で登録画面に戻り、以後は何も映りません。
          もう一度使うには、現地で出る QR を読み取って登録し直してください。
        </Text>
      ),
      labels: { confirm: "失効させる", cancel: "戻る" },
      confirmProps: { color: "red" },
      onConfirm: () => run(() => revokeDisplay(display.id), "失効させました"),
    });

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: "ディスプレイの削除",
      children: <Text size="sm">この操作は取り消せません。</Text>,
      labels: { confirm: "削除", cancel: "戻る" },
      confirmProps: { color: "red" },
      onConfirm: () =>
        run(
          () => deleteDisplay(display.id),
          "削除しました",
          () => router.push("/settings/kiosk-devices"),
        ),
    });

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <Group gap="xs">
            {display.status === "LINKED" && (
              <SecondaryButton
                loading={pending}
                onClick={() =>
                  run(() => activateDisplay(display.id), "有効化しました")
                }
              >
                有効化
              </SecondaryButton>
            )}
            {display.status === "ACTIVE" && (
              <SecondaryButton
                loading={pending}
                onClick={() =>
                  run(
                    () => setDisplayEnabled(display.id, false),
                    "一時停止しました",
                  )
                }
              >
                一時停止
              </SecondaryButton>
            )}
            {display.status !== "PENDING" && display.status !== "REVOKED" && (
              <SecondaryButton
                loading={pending}
                onClick={() =>
                  run(() => unlinkDisplay(display.id), "リンクを解除しました")
                }
              >
                リンク解除
              </SecondaryButton>
            )}
            {display.status === "DISABLED" && (
              <SecondaryButton
                loading={pending}
                onClick={() =>
                  run(() => setDisplayEnabled(display.id, true), "再開しました")
                }
              >
                再開
              </SecondaryButton>
            )}
            {display.status === "REVOKED" || display.status === "PENDING" ? (
              <DangerButton loading={pending} onClick={confirmDelete}>
                削除
              </DangerButton>
            ) : (
              <DangerButton loading={pending} onClick={confirmRevoke}>
                失効
              </DangerButton>
            )}
          </Group>
        }
        breadcrumbs={[
          { label: "システム" },
          { label: "ディスプレイ管理", href: "/settings/kiosk-devices" },
          { label: display.name ?? "ディスプレイ" },
        ]}
        title={display.name ?? "（名称未設定）"}
      />

      <Group gap="sm">
        <Badge
          color={online ? "green" : "gray"}
          size="lg"
          variant={online ? "filled" : "light"}
        >
          {online ? "オンライン" : "オフライン"}
        </Badge>
        <Badge color={status.color} size="lg" variant="light">
          {status.label}
        </Badge>
      </Group>

      {display.status === "PENDING" && (
        <Alert color="gray">
          このプロファイルはまだ画面と結びついていません。ディスプレイの画面に
          出ているリンクコードを、一覧の「リンク」から入力してください。
        </Alert>
      )}
      {display.status === "LINKED" && (
        <Alert color="yellow">
          画面とリンクしました。「有効化」を押すと表示を開始します。
        </Alert>
      )}
      {display.status === "REVOKED" && (
        <Alert color="red">
          このディスプレイは失効しています。もう一度使うには、現地の画面に出る
          リンクコードで登録し直してください。
        </Alert>
      )}

      <Paper p="md" radius="md" withBorder>
        <SummaryGrid>
          <FieldValue
            label="最終確認"
            value={display.lastSeenAt ? fmt.dateTime(display.lastSeenAt) : "—"}
          />
          <FieldValue label="拠点" value={display.plantName ?? "—"} />
          <FieldValue label="設置場所" value={display.location ?? "—"} />
          <FieldValue
            label="表示内容"
            value={display.profileName ?? "未割当"}
          />
          <FieldValue
            label="リンク"
            value={display.linkedAt ? fmt.dateTime(display.linkedAt) : "—"}
          />
          <FieldValue
            label="有効化"
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
            label="登録の期限"
            value={
              display.deviceTokenExpiresAt
                ? fmt.dateTime(display.deviceTokenExpiresAt)
                : "—"
            }
          />
        </SummaryGrid>
      </Paper>

      <AppTabs defaultValue="settings">
        <Tabs.List>
          <Tabs.Tab value="settings">設定</Tabs.Tab>
          <Tabs.Tab value="device">端末情報</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="settings">
          <Paper p="md" radius="md" withBorder>
            <Stack gap="md">
              <Title order={5}>この画面の設定</Title>
              <TextInput
                label="ディスプレイの名前"
                onChange={(e) => setNameJa(e.currentTarget.value)}
                value={nameJa}
                withAsterisk
              />
              <TextInput
                label="設置場所"
                onChange={(e) => setLocation(e.currentTarget.value)}
                value={location}
              />
              <Select
                clearable
                data={plantOptions}
                label="拠点"
                onChange={setPlantId}
                placeholder="選択してください"
                searchable
                value={plantId}
              />
              <Select
                clearable
                data={profiles.map((p) => ({ value: p.id, label: p.name }))}
                description="保存すると、この画面の表示がその場で切り替わります"
                label="表示内容"
                onChange={setProfileId}
                placeholder="選択してください"
                searchable
                value={profileId}
              />

              <ScaleField onChange={setScalePercent} value={scalePercent} />
              <FormActions
                loading={pending}
                onCancel={() => router.push("/settings/kiosk-devices")}
                onSave={save}
              />
            </Stack>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel keepMounted={false} pt="md" value="device">
          <Paper p="md" radius="md" withBorder>
            <SummaryGrid cols={2}>
              <FieldValue
                label="最後に見た IP アドレス"
                value={display.lastIpAddress ?? "—"}
              />
              <FieldValue
                label="アプリのバージョン"
                value={display.appVersion ?? "—"}
              />
              <FieldValue
                fullWidth
                label="ブラウザ"
                value={display.userAgent ?? "—"}
              />
            </SummaryGrid>
          </Paper>
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
  // よく使う 3 つ。ここに無い値のときは選択なしにして、スライダーだけ効かせる
  const PRESETS = [
    { value: "85", label: "小さめ" },
    { value: "100", label: "標準" },
    { value: "125", label: "大きめ" },
  ];
  const preset = PRESETS.some((p) => p.value === String(value))
    ? String(value)
    : "";

  return (
    <Stack gap="xs">
      <Text fw={500} size="sm">
        表示倍率
      </Text>
      <Text c="dimmed" size="xs">
        画面の大きさと、どのくらい離れて見るかに合わせて調整します。
        大きくすると 1 画面に入る件数は減り、あふれた分はページ送りになります。
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
