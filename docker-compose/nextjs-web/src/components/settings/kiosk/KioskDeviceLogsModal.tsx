"use client";

/**
 * KioskDeviceLogsModal — 端末の利用履歴（app.kiosk_device_logs）モーダル。
 *
 * SY09 一覧の行アクション「利用履歴」から開く。ONLINE/OFFLINE（プレゼンス
 * 遷移）と LOGIN/LOGOUT（誰がいつ使ったか）を新しい順に 50 件ずつ表示。
 * 取得はサーバーアクション fetchDeviceLogs（kiosk:READ ゲート）。
 * リスト本体は DeviceLogList — 端末詳細ページ（[id]）と共用。
 */

import {
  Badge,
  Center,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { IconHistory } from "@tabler/icons-react";
import { useEffect, useState, useTransition } from "react";
import { fetchDeviceLogs } from "@/app/(dashboard)/settings/kiosk-devices/actions";
import { SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModalShell } from "@/components/ui/modals";
import { formatDateTime } from "@/lib/format";
import type { KioskDeviceLogRow } from "@/lib/kiosk-admin";

const TYPE_LABEL: Record<
  KioskDeviceLogRow["type"],
  { label: string; color: string }
> = {
  ONLINE: { label: "オンライン", color: "teal" },
  OFFLINE: { label: "オフライン", color: "gray" },
  LOGIN: { label: "ログイン", color: "blue" },
  LOGOUT: { label: "ログアウト", color: "orange" },
};

/** source の管理者向け表示（内部トークンをそのまま出さない）。 */
const SOURCE_LABEL: Record<string, string> = {
  ws: "WS",
  sweep: "定期判定",
  pg_cron: "DB定期処理",
  login: "",
  logout: "本人操作",
  expired: "自動（無操作/期限）",
  admin: "管理者操作",
  reset: "端末リセット",
};

/**
 * 利用履歴リスト（クライアント取得 + ページング）。
 * モーダルと端末詳細ページの両方から使う。
 */
export function DeviceLogList({ deviceId }: { deviceId: string }) {
  const [rows, setRows] = useState<KioskDeviceLogRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = (cursor?: string) => {
    startTransition(async () => {
      const result = await fetchDeviceLogs(deviceId, cursor);
      if (!result.ok) {
        setError(result.error);
        setLoaded(true);
        return;
      }
      setRows((prev) =>
        cursor ? [...prev, ...result.data.rows] : result.data.rows,
      );
      setNextCursor(result.data.nextCursor);
      setError(null);
      setLoaded(true);
    });
  };

  // deviceId が変わったらリセットして最初のページを読み直す。
  // biome-ignore lint/correctness/useExhaustiveDependencies: deviceId の変化でリセットして再取得する
  useEffect(() => {
    setRows([]);
    setNextCursor(null);
    setError(null);
    setLoaded(false);
    load();
  }, [deviceId]);

  return (
    <Stack gap={0}>
      {!loaded && (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      )}
      {loaded && error && (
        <Text c="red" py="md" size="sm">
          {error}
        </Text>
      )}
      {loaded && !error && rows.length === 0 && (
        <EmptyState
          icon={<IconHistory size={28} />}
          message="利用履歴はまだありません"
        />
      )}
      {rows.map((r, i) => (
        <div key={r.id}>
          {i > 0 && <Divider />}
          {/* モバイルでも潰れないよう左側は折り返し可・時刻は右上に固定 */}
          <Group
            align="flex-start"
            gap="sm"
            justify="space-between"
            py={8}
            wrap="nowrap"
          >
            <Group gap="xs" style={{ minWidth: 0 }} wrap="wrap">
              <Badge color={TYPE_LABEL[r.type].color} miw={92} variant="light">
                {TYPE_LABEL[r.type].label}
              </Badge>
              <Text size="sm" truncate>
                {r.userName ??
                  (r.type === "LOGIN" || r.type === "LOGOUT"
                    ? "（不明なユーザー）"
                    : "")}
              </Text>
              {r.source && SOURCE_LABEL[r.source] && (
                <Text c="dimmed" size="xs">
                  {SOURCE_LABEL[r.source] ?? r.source}
                </Text>
              )}
            </Group>
            <Text c="dimmed" size="xs" style={{ flexShrink: 0 }}>
              {formatDateTime(r.createdAt)}
            </Text>
          </Group>
        </div>
      ))}
      {nextCursor && (
        <Center pt="sm">
          <SecondaryButton loading={isPending} onClick={() => load(nextCursor)}>
            さらに読み込む
          </SecondaryButton>
        </Center>
      )}
    </Stack>
  );
}

export function KioskDeviceLogsModal({
  deviceId,
  deviceName,
  onClose,
}: {
  /** null なら閉じている。 */
  deviceId: string | null;
  deviceName: string | null;
  onClose: () => void;
}) {
  return (
    <ModalShell
      hideFooter
      onClose={onClose}
      opened={deviceId != null}
      size="lg"
      title={`利用履歴 — ${deviceName ?? ""}`}
    >
      {deviceId != null && <DeviceLogList deviceId={deviceId} />}
    </ModalShell>
  );
}
