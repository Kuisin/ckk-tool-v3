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
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { loginMethodLabel, loginReasonLabel } from "@/lib/login-attempt-core";
import type {
  LoginAttemptRow,
  LoginAttemptSummary,
} from "@/lib/login-attempts";
import { LoginAttemptDrawer } from "./LoginAttemptDrawer";
import { OwnershipBadge, ownershipOptions } from "./ownership";

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
  const tr = useTranslations();
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

  const DAY_OPTIONS = [
    { value: "1", label: tr("settings.loginHistoryView.hours24") },
    { value: "7", label: tr("settings.loginHistoryView.days7") },
    { value: "30", label: tr("settings.loginHistoryView.days30") },
    { value: "90", label: tr("settings.loginHistoryView.days90") },
    { value: "400", label: tr("settings.loginHistoryView.allTime") },
  ];

  const OUTCOME_OPTIONS = [
    { value: "FAILURE", label: tr("common.failure") },
    { value: "SUCCESS", label: tr("settings.security.success") },
  ];

  // 面（どの入口からのログインか）。ポータルは app 列では区別できない —
  // nextjs-web が配信しているので app は WEB で、method の PORTAL_ 接頭辞で見る。
  const APP_OPTIONS = [
    { value: "WEB", label: t("appWeb") },
    { value: "KIOSK", label: t("appKiosk") },
    { value: "PORTAL", label: tr("common.partnerPortal") },
  ];

  const columns: Column<LoginAttemptRow>[] = [
    {
      key: "at",
      header: tr("common.dateAndTime"),
      width: 150,
      render: (r) => (
        <Text c="dimmed" className="tabular-nums" size="xs">
          {fmt.dateTime(r.createdAt)}
        </Text>
      ),
    },
    {
      key: "outcome",
      header: tr("settings.security.result"),
      width: 70,
      render: (r) => (
        <Badge
          color={r.outcome === "SUCCESS" ? "green" : "red"}
          size="xs"
          variant="light"
        >
          {r.outcome === "SUCCESS"
            ? tr("settings.security.success")
            : tr("common.failure")}
        </Badge>
      ),
    },
    {
      key: "app",
      header: tr("common.apps"),
      width: 80,
      render: (r) => (
        <Text size="xs">
          {r.isPortal
            ? tr("common.partnerPortal")
            : r.app === "KIOSK"
              ? t("appKiosk")
              : t("appWeb")}
        </Text>
      ),
    },
    {
      key: "method",
      header: tr("common.method"),
      width: 130,
      render: (r) => <Text size="xs">{loginMethodLabel(r.method)}</Text>,
    },
    {
      key: "user",
      header: tr("common.user"),
      width: 150,
      render: (r) =>
        r.userName ? (
          <Text size="sm">{r.userName}</Text>
        ) : r.portalAccountName ? (
          // 社外の主体（app.users ではない）。**アドレスは出さない**。
          <Group gap={4} wrap="nowrap">
            <Badge color="cyan" size="xs" variant="light">
              {tr("settings.security.external")}
            </Badge>
            <Text size="sm" truncate>
              {r.portalAccountName}
            </Text>
          </Group>
        ) : (
          // 未解決の入力は生値を残していない（相関キーの先頭だけ出す）
          <Tooltip
            label={tr("settings.security.attemptsThatCouldNotBeResolved")}
            withinPortal
          >
            <Text c="dimmed" ff="mono" size="xs">
              {r.identifierRef
                ? tr("settings.loginHistoryView.unresolvedWithRef", {
                    ref: r.identifierRef.slice(0, 8),
                  })
                : "—"}
            </Text>
          </Tooltip>
        ),
    },
    {
      key: "reason",
      header: tr("common.reason"),
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
      header: tr("common.deviceType"),
      width: 130,
      render: (r) => (
        <OwnershipBadge source={r.ownershipSource} value={r.ownership} />
      ),
    },
    {
      key: "device",
      header: tr("common.device"),
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
        breadcrumbs={[
          tr("common.system"),
          tr("settings.security.loginHistory"),
        ]}
        filters={
          <>
            <Select
              data={DAY_OPTIONS}
              flex={isMobile ? 1 : undefined}
              onChange={setDays}
              placeholder={tr("common.period")}
              value={days ?? "7"}
              w={isMobile ? undefined : 110}
            />
            <Select
              clearable
              data={OUTCOME_OPTIONS}
              flex={isMobile ? 1 : undefined}
              onChange={setOutcome}
              placeholder={tr("settings.security.result")}
              value={outcome}
              w={isMobile ? undefined : 100}
            />
            <Select
              clearable
              data={APP_OPTIONS}
              flex={isMobile ? 1 : undefined}
              onChange={setApp}
              placeholder={tr("common.apps")}
              value={app}
              w={isMobile ? undefined : 110}
            />
            <Select
              clearable
              data={ownershipOptions(tr)}
              flex={isMobile ? 1 : undefined}
              onChange={setOwnership}
              placeholder={tr("common.deviceType")}
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
            placeholder={tr("settings.security.iPCidrEG192168")}
            value={ip}
          />
        }
        title={tr("settings.security.loginHistory")}
      >
        <Stack gap="md">
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            <SummaryCard
              color={summary.failures24h > 0 ? "red" : undefined}
              label={tr("settings.security.failuresIn24Hours")}
              value={String(summary.failures24h)}
            />
            <SummaryCard
              label={tr("settings.security.successesIn24Hours")}
              value={String(summary.successes24h)}
            />
            <Paper p="sm" radius="md" withBorder>
              <Text c="dimmed" size="xs">
                {tr("settings.security.mostFailuresByIp24h")}
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
                {tr("settings.security.mostFailuresByCounterparty24h")}
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
            emptyMessage={tr(
              "settings.security.thereAreNoMatchingLoginRecords",
            )}
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
                      {r.outcome === "SUCCESS"
                        ? tr("settings.security.success")
                        : tr("common.failure")}
                    </Badge>
                    <Text size="xs">{loginMethodLabel(r.method)}</Text>
                  </Group>
                  <Text fw={600} size="sm" truncate>
                    {r.userName ??
                      r.portalAccountName ??
                      (r.identifierRef
                        ? tr("settings.loginHistoryView.unresolvedWithRef", {
                            ref: r.identifierRef.slice(0, 8),
                          })
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
              {tr("settings.security.thereAreOlderRecordsNarrowThe")}
            </Text>
          )}
        </Stack>
      </ListShell>

      <LoginAttemptDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
