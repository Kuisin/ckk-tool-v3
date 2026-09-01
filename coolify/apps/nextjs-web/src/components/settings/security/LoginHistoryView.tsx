"use client";

/**
 * LoginHistoryView — ログイン履歴（SY0D）の一覧。
 *
 * 絞り込みは URL search params に持ち、**サーバー側**で効かせる
 * （認証イベントは 1 日で数千行になりうるので、全件を持ってきてクライアントで
 * 絞る方式は取らない）。詳細は行クリックでドロワー — 詳細ページを作らないのは
 * 詳細用の操作コードを増やさないため。
 */

import {
  Badge,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconSearch, IconShieldLock } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { ListShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { loginMethodLabel, loginReasonLabel } from "@/lib/login-attempt-core";
import type {
  LoginAttemptRow,
  LoginAttemptSummary,
} from "@/lib/login-attempts";
import { LoginAttemptDrawer } from "./LoginAttemptDrawer";
import { OWNERSHIP_OPTIONS, OwnershipBadge } from "./ownership";

const DAY_OPTIONS = [
  { value: "1", label: "24 時間" },
  { value: "7", label: "7 日" },
  { value: "30", label: "30 日" },
  { value: "90", label: "90 日" },
  { value: "400", label: "全期間" },
];

const OUTCOME_OPTIONS = [
  { value: "FAILURE", label: "失敗" },
  { value: "SUCCESS", label: "成功" },
];

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Paper p="sm" radius="md" withBorder>
      <Text c="dimmed" size="xs">
        {label}
      </Text>
      <Text c={color} className="tabular-nums" fw={700} size="lg">
        {value}
      </Text>
    </Paper>
  );
}

export function LoginHistoryView({
  rows,
  summary,
  hasMore,
}: {
  rows: LoginAttemptRow[];
  summary: LoginAttemptSummary;
  hasMore: boolean;
}) {
  const tr = useTr();
  const isMobile = useIsMobile();
  const fmt = useFormat();
  const t = useTranslations("loginHistory");
  const [openId, setOpenId] = useState<string | null>(null);

  const [days, setDays] = useUrlSelectState("days");
  const [outcome, setOutcome] = useUrlSelectState("outcome");
  const [app, setApp] = useUrlSelectState("app");
  const [ownership, setOwnership] = useUrlSelectState("own");
  const [ip, setIp] = useUrlStringState("ip");

  const reset = () => {
    setDays(null);
    setOutcome(null);
    setApp(null);
    setOwnership(null);
    setIp(null);
  };

  // 面（どの入口からのログインか）。ポータルは app 列では区別できない —
  // nextjs-web が配信しているので app は WEB で、method の PORTAL_ 接頭辞で見る。
  const APP_OPTIONS = [
    { value: "WEB", label: t("appWeb") },
    { value: "KIOSK", label: t("appKiosk") },
    { value: "PORTAL", label: tr("取引先ポータル") },
  ];

  const columns: Column<LoginAttemptRow>[] = [
    {
      key: "at",
      header: tr("日時"),
      width: 150,
      render: (r) => (
        <Text c="dimmed" className="tabular-nums" size="xs">
          {fmt.dateTime(r.createdAt)}
        </Text>
      ),
    },
    {
      key: "outcome",
      header: tr("結果"),
      width: 70,
      render: (r) => (
        <Badge
          color={r.outcome === "SUCCESS" ? "green" : "red"}
          size="xs"
          variant="light"
        >
          {r.outcome === "SUCCESS" ? "成功" : tr("失敗")}
        </Badge>
      ),
    },
    {
      key: "app",
      header: tr("アプリ"),
      width: 80,
      render: (r) => (
        <Text size="xs">
          {r.isPortal
            ? tr("取引先ポータル")
            : r.app === "KIOSK"
              ? t("appKiosk")
              : t("appWeb")}
        </Text>
      ),
    },
    {
      key: "method",
      header: tr("方式"),
      width: 130,
      render: (r) => <Text size="xs">{loginMethodLabel(r.method)}</Text>,
    },
    {
      key: "user",
      header: tr("ユーザー"),
      width: 150,
      render: (r) =>
        r.userName ? (
          <Text size="sm">{r.userName}</Text>
        ) : r.portalAccountName ? (
          // 社外の主体（app.users ではない）。**アドレスは出さない**。
          <Group gap={4} wrap="nowrap">
            <Badge color="cyan" size="xs" variant="light">
              {tr("社外")}
            </Badge>
            <Text size="sm" truncate>
              {r.portalAccountName}
            </Text>
          </Group>
        ) : (
          // 未解決の入力は生値を残していない（相関キーの先頭だけ出す）
          <Tooltip
            label={tr(
              tr(
                tr(
                  "ユーザーに解決できなかった試行。入力値は保存していません（相関キーのみ）。",
                ),
              ),
            )}
            withinPortal
          >
            <Text c="dimmed" ff="mono" size="xs">
              {r.identifierRef ? `未解決 ${r.identifierRef.slice(0, 8)}` : "—"}
            </Text>
          </Tooltip>
        ),
    },
    {
      key: "reason",
      header: tr("理由"),
      width: 150,
      render: (r) => (
        <Text c={r.outcome === "FAILURE" ? undefined : "dimmed"} size="xs">
          {loginReasonLabel(r.reason)}
        </Text>
      ),
    },
    {
      key: "ip",
      header: "IP",
      width: 130,
      render: (r) => (
        <Text ff="mono" size="xs">
          {r.ipAddress ?? "—"}
        </Text>
      ),
    },
    {
      key: "ownership",
      header: tr("端末区分"),
      width: 130,
      render: (r) => (
        <OwnershipBadge source={r.ownershipSource} value={r.ownership} />
      ),
    },
    {
      key: "device",
      header: tr("端末"),
      width: 170,
      render: (r) => (
        <Text size="xs" truncate>
          {r.kioskDeviceName ??
            r.userDeviceLabel ??
            (r.fingerprint ? `${r.fingerprint.slice(0, 8)}…` : "—")}
        </Text>
      ),
    },
  ];

  return (
    <>
      <ListShell
        breadcrumbs={[tr("システム"), tr("ログイン履歴")]}
        filters={
          <>
            <Select
              data={DAY_OPTIONS}
              flex={isMobile ? 1 : undefined}
              onChange={setDays}
              placeholder={tr("期間")}
              value={days ?? "7"}
              w={isMobile ? undefined : 110}
            />
            <Select
              clearable
              data={OUTCOME_OPTIONS}
              flex={isMobile ? 1 : undefined}
              onChange={setOutcome}
              placeholder={tr("結果")}
              value={outcome}
              w={isMobile ? undefined : 100}
            />
            <Select
              clearable
              data={APP_OPTIONS}
              flex={isMobile ? 1 : undefined}
              onChange={setApp}
              placeholder={tr("アプリ")}
              value={app}
              w={isMobile ? undefined : 110}
            />
            <Select
              clearable
              data={OWNERSHIP_OPTIONS}
              flex={isMobile ? 1 : undefined}
              onChange={setOwnership}
              placeholder={tr("端末区分")}
              value={ownership}
              w={isMobile ? undefined : 160}
            />
          </>
        }
        onReset={reset}
        search={
          <TextInput
            leftSection={<IconSearch size={14} />}
            onChange={(e) => setIp(e.currentTarget.value)}
            // CIDR をそのまま受ける（サーバー側で inet の <<= に落とす）
            placeholder={tr("IP / CIDR（例 192.168.50.0/24）")}
            value={ip}
          />
        }
        title={tr("ログイン履歴")}
      >
        <Stack gap="md">
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            <SummaryCard
              color={summary.failures24h > 0 ? "red" : undefined}
              label={tr("24時間の失敗")}
              value={String(summary.failures24h)}
            />
            <SummaryCard
              label={tr("24時間の成功")}
              value={String(summary.successes24h)}
            />
            <Paper p="sm" radius="md" withBorder>
              <Text c="dimmed" size="xs">
                {tr("失敗の多い IP（24h）")}
              </Text>
              {summary.topFailureIps.length === 0 ? (
                <Text c="dimmed" size="xs">
                  —
                </Text>
              ) : (
                summary.topFailureIps.map((r) => (
                  <Group gap={6} key={r.ip} wrap="nowrap">
                    <Text ff="mono" size="xs" truncate>
                      {r.ip}
                    </Text>
                    <Text c="dimmed" size="xs">
                      {r.n}
                    </Text>
                  </Group>
                ))
              )}
            </Paper>
            <Paper p="sm" radius="md" withBorder>
              <Text c="dimmed" size="xs">
                {tr("失敗の多い相手（24h）")}
              </Text>
              {summary.topFailureUsers.length === 0 ? (
                <Text c="dimmed" size="xs">
                  —
                </Text>
              ) : (
                summary.topFailureUsers.map((r) => (
                  <Group gap={6} key={r.label} wrap="nowrap">
                    <Text size="xs" truncate>
                      {r.label}
                    </Text>
                    <Text c="dimmed" size="xs">
                      {r.n}
                    </Text>
                  </Group>
                ))
              )}
            </Paper>
          </SimpleGrid>

          <DataTable
            columns={columns}
            data={rows}
            emptyIcon={<IconShieldLock size={24} />}
            emptyMessage={tr("該当するログイン記録がありません")}
            getRowId={(r) => r.id}
            onRowClick={(r) => setOpenId(r.id)}
            renderCard={(r) => (
              <Group align="flex-start" justify="space-between" wrap="nowrap">
                <div className="min-w-0">
                  <Group gap="xs">
                    <Badge
                      color={r.outcome === "SUCCESS" ? "green" : "red"}
                      size="xs"
                      variant="light"
                    >
                      {r.outcome === "SUCCESS" ? "成功" : tr("失敗")}
                    </Badge>
                    <Text size="xs">{loginMethodLabel(r.method)}</Text>
                  </Group>
                  <Text fw={600} size="sm" truncate>
                    {r.userName ??
                      r.portalAccountName ??
                      (r.identifierRef
                        ? `未解決 ${r.identifierRef.slice(0, 8)}`
                        : "—")}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {loginReasonLabel(r.reason)}
                  </Text>
                </div>
                <div className="shrink-0 text-right">
                  <Text c="dimmed" size="xs">
                    {fmt.dateTime(r.createdAt)}
                  </Text>
                  <Text ff="mono" size="xs">
                    {r.ipAddress ?? "—"}
                  </Text>
                  <OwnershipBadge
                    source={r.ownershipSource}
                    value={r.ownership}
                  />
                </div>
              </Group>
            )}
            urlState
          />

          {hasMore && (
            <Text c="dimmed" size="xs" ta="center">
              {tr("さらに古い記録があります。期間や絞り込みを狭めてください。")}
            </Text>
          )}
        </Stack>
      </ListShell>

      <LoginAttemptDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
