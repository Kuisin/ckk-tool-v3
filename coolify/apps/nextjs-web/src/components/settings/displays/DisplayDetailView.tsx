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
  Select,
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
  deleteDisplay,
  revokeDisplay,
  setDisplayEnabled,
  updateDisplay,
} from "@/app/(dashboard)/settings/displays/actions";
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
          () => router.push("/settings/displays"),
        ),
    });

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <Group gap="xs">
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
            {display.status !== "REVOKED" ? (
              <DangerButton loading={pending} onClick={confirmRevoke}>
                失効
              </DangerButton>
            ) : (
              <DangerButton loading={pending} onClick={confirmDelete}>
                削除
              </DangerButton>
            )}
          </Group>
        }
        breadcrumbs={[
          { label: "システム" },
          { label: "ディスプレイ管理", href: "/settings/displays" },
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

      {display.status === "REVOKED" && (
        <Alert color="red">
          このディスプレイは失効しています。もう一度使うには、現地の画面に出る
          QR コードを読み取って登録し直してください。
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
            label="登録"
            value={
              display.pairedAt
                ? `${fmt.dateTime(display.pairedAt)}${
                    display.pairedByName ? `（${display.pairedByName}）` : ""
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
              <FormActions
                loading={pending}
                onCancel={() => router.push("/settings/displays")}
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
