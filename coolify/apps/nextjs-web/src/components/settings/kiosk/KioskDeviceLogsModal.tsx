"use client";

/**
 * KioskDeviceLogsModal — 端末の利用履歴（セッションベース）モーダル。
 *
 * kiosk_sessions から「誰が・いつからいつまで」を新しい順に表示する。
 * 利用中（未失効）は緑バッジ + 開始時刻のみ、終了済みは開始 → 終了 + 所要時間。
 * リスト本体は DeviceLogList — 端末詳細ページ（[id]）と共用。
 * 取得はサーバーアクション fetchDeviceSessions（kiosk:READ ゲート）。
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
import { fetchDeviceSessions } from "@/app/(dashboard)/settings/kiosk-devices/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModalShell } from "@/components/ui/modals";
import { useTr } from "@/hooks/useTr";
import type { Formatters } from "@/lib/format";
import type { KioskDeviceSessionRow } from "@/lib/kiosk-admin";

function formatDuration(startIso: string, endIso: string): string {
  const mins = Math.max(
    1,
    Math.round(
      (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000,
    ),
  );
  if (mins < 60) return `${mins}分`;
  return `${Math.floor(mins / 60)}時間${mins % 60 > 0 ? `${mins % 60}分` : ""}`;
}

/** 終了時刻: 同じ日（表示タイムゾーン基準）なら時刻のみ（行を短く保つ）。 */
function formatEnd(fmt: Formatters, startIso: string, endIso: string): string {
  return fmt.date(startIso) === fmt.date(endIso)
    ? fmt.time(endIso)
    : fmt.dateTime(endIso);
}

/**
 * 利用履歴リスト（セッション単位・クライアント取得 + ページング）。
 * モーダルと端末詳細ページの両方から使う。
 */
export function DeviceLogList({ deviceId }: { deviceId: string }) {
  const tr = useTr();
  const fmt = useFormat();
  const [rows, setRows] = useState<KioskDeviceSessionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = (cursor?: string) => {
    startTransition(async () => {
      const result = await fetchDeviceSessions(deviceId, cursor);
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
          message={tr("利用履歴はまだありません")}
        />
      )}
      {rows.map((r, i) => (
        <div key={r.id}>
          {i > 0 && <Divider />}
          <Group
            align="flex-start"
            gap="sm"
            justify="space-between"
            py={8}
            wrap="nowrap"
          >
            <Group gap="xs" style={{ minWidth: 0 }} wrap="nowrap">
              <Badge
                color={r.endedAt ? "gray" : "green"}
                miw={72}
                variant={r.endedAt ? "light" : "filled"}
              >
                {r.endedAt ? "終了" : tr("利用中")}
              </Badge>
              <Text fw={500} size="sm" truncate>
                {r.userName}
              </Text>
            </Group>
            <Stack align="flex-end" gap={0} style={{ flexShrink: 0 }}>
              <Text c="dimmed" size="sm">
                {fmt.dateTime(r.startedAt)}
                {r.endedAt
                  ? ` → ${formatEnd(fmt, r.startedAt, r.endedAt)}`
                  : " →"}
              </Text>
              <Text c="dimmed" size="xs">
                {r.endedAt
                  ? formatDuration(r.startedAt, r.endedAt)
                  : tr("ログイン中")}
              </Text>
            </Stack>
          </Group>
        </div>
      ))}
      {nextCursor && (
        <Center pt="sm">
          <SecondaryButton loading={isPending} onClick={() => load(nextCursor)}>
            {tr("さらに読み込む")}
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
