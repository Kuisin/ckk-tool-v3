"use client";

/**
 * LoginAttemptDrawer — ログイン履歴 1 件の詳細。
 *
 * 開いたときに初めてサーバーから取りに行き、そのときだけ監査に VIEW を残す
 * （一覧を描くたびに監査行を出すとノイズになる）。
 *
 * 収集シグネチャ（signals）には**危険サインの強調**を付ける。ログイン失敗の
 * 調査で最初に見るのは「自動操作か」「時計がずれていないか」なので、
 * 生の JSON を読ませずに済むようにする。
 */

import {
  Alert,
  Badge,
  Code,
  Drawer,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { fetchLoginAttemptDetail } from "@/app/(dashboard)/settings/login-history/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { FieldValue } from "@/components/ui/FieldValue";
import { useTr } from "@/hooks/useTr";
import { loginMethodLabel, loginReasonLabel } from "@/lib/login-attempt-core";
import type { LoginAttemptDetail } from "@/lib/login-attempts";
import { OwnershipBadge } from "./ownership";

/** 時計ずれの警告しきい値（分）。 */
const CLOCK_SKEW_WARN_MIN = 5;

interface Signals {
  [key: string]: unknown;
  webdriver?: boolean | null;
  clientNowMs?: number | null;
}

function riskFlags(signals: Signals | null, recordedAt: string): string[] {
  if (!signals) return [];
  const flags: string[] = [];
  if (signals.webdriver === true) {
    flags.push("自動操作フラグ（navigator.webdriver）が立っています");
  }
  if (typeof signals.clientNowMs === "number") {
    const skewMin = Math.abs(
      (signals.clientNowMs - new Date(recordedAt).getTime()) / 60_000,
    );
    if (skewMin > CLOCK_SKEW_WARN_MIN) {
      flags.push(
        `端末の時計がサーバーと ${Math.round(skewMin)} 分ずれています`,
      );
    }
  }
  return flags;
}

export function LoginAttemptDrawer({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const tr = useTr();
  const fmt = useFormat();
  const [row, setRow] = useState<LoginAttemptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setRow(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setRow(null);
    setError(null);
    fetchLoginAttemptDetail(id).then((res) => {
      if (cancelled) return;
      if (res.ok) setRow(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const signals = (row?.signals ?? null) as Signals | null;
  const flags = row ? riskFlags(signals, row.createdAt) : [];

  return (
    <Drawer
      onClose={onClose}
      opened={id !== null}
      padding="md"
      position="right"
      size="lg"
      title={tr("ログイン記録")}
    >
      {!row && !error && (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      )}
      {error && (
        <Alert color="red" title={tr("読み込めませんでした")}>
          {error}
        </Alert>
      )}
      {row && (
        <Stack gap="md">
          {flags.length > 0 && (
            <Alert
              color="orange"
              icon={<IconAlertTriangle size={16} />}
              title={tr("注意すべき兆候")}
            >
              <Stack gap={2}>
                {flags.map((f) => (
                  <Text key={f} size="xs">
                    {f}
                  </Text>
                ))}
              </Stack>
            </Alert>
          )}

          <Group gap="xs">
            <Badge
              color={row.outcome === "SUCCESS" ? "green" : "red"}
              variant="light"
            >
              {row.outcome === "SUCCESS" ? "成功" : tr("失敗")}
            </Badge>
            <Badge color="gray" variant="light">
              {row.app === "KIOSK" ? "共有端末" : "Web"}
            </Badge>
            <OwnershipBadge
              size="sm"
              source={row.ownershipSource}
              value={row.ownership}
            />
          </Group>

          <Stack gap="xs">
            <FieldValue
              label={tr("日時")}
              value={fmt.dateTime(row.createdAt)}
            />
            <FieldValue
              label={tr("方式")}
              value={loginMethodLabel(row.method)}
            />
            <FieldValue
              label={tr("理由")}
              value={
                row.outcome === "FAILURE" ? loginReasonLabel(row.reason) : "—"
              }
            />
            <FieldValue
              label={tr("ユーザー")}
              value={
                row.userName
                  ? `${row.userName}${row.userUsername ? `（${row.userUsername}）` : ""}`
                  : tr("解決できず（入力値は保存していません）")
              }
            />
            {row.identifierRef && !row.userId && (
              <FieldValue
                label={tr("入力の相関キー")}
                value={<Code>{row.identifierRef.slice(0, 16)}…</Code>}
              />
            )}
            <FieldValue label={tr("送信元 IP")} value={row.ipAddress ?? "—"} />
            {row.ipChain && (
              <FieldValue
                label={tr("プロキシチェーン")}
                value={<Code>{row.ipChain}</Code>}
              />
            )}
            <FieldValue
              label={tr("判定理由")}
              value={<Code>{row.ownershipSource ?? "—"}</Code>}
            />
            <FieldValue
              label={tr("端末シグネチャ")}
              value={
                row.fingerprint ? (
                  <Code>{row.fingerprint}</Code>
                ) : (
                  // IdP 起点の SSO はログイン画面を通らないので付かない。異常ではない
                  tr("—（この経路では収集されません）")
                )
              }
            />
            {row.kioskDeviceName && (
              <FieldValue label={tr("共有端末")} value={row.kioskDeviceName} />
            )}
            {row.scanKind && (
              <FieldValue
                label={tr("読み取り種別")}
                value={tr("{scanKind}（内容は保存していません）", {
                  scanKind: row.scanKind,
                })}
              />
            )}
            <FieldValue label="User-Agent" value={row.userAgent ?? "—"} />
          </Stack>

          {signals && (
            <Stack gap={4}>
              <Text c="dimmed" size="xs">
                収集シグネチャ（v{row.signalsVersion ?? "?"}）
              </Text>
              <Code block>{JSON.stringify(signals, null, 2)}</Code>
            </Stack>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
