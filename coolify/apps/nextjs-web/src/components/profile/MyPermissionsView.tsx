"use client";

/**
 * MyPermissionsView — 「自分は何を持っていて、何を持っていないか」。
 *
 * **持っていない権限も薄く並べる。** 持っているものだけを出すと、一覧に無いのが
 * 「権限が無い」なのか「そんな権限は存在しない」なのか区別できない。区別できる
 * ようにするのがこの画面の目的なので、ある / 無い を同じ表に並べて色で分ける。
 *
 * 特権操作は「権限がある」＝「できる」ではないので、行の中でさらに
 * 実行できる / 承認依頼中 / 申請が要る を出し分ける。
 */

import {
  Alert,
  Badge,
  Card,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconCheck,
  IconClock,
  IconInfoCircle,
  IconLock,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ListShell } from "@/components/ui/shells";
import type {
  MyPermissionRow,
  MyPermissionsView as View,
} from "@/lib/my-permissions";
import {
  actionLabel,
  PERMISSION_GROUP_LABEL,
  scopeLabel,
} from "@/lib/permission-labels";

function remainingLabel(
  ms: number | null,
  tr: ReturnType<typeof useTranslations>,
): string | null {
  if (ms == null || ms <= 0) return null;
  const m = Math.floor(ms / 60_000);
  return m >= 60
    ? tr("profile.myPermissionsView.remainingHoursMinutes", {
        hours: Math.floor(m / 60),
        minutes: m % 60,
      })
    : tr("profile.myPermissionsView.remainingMinutes", {
        minutes: Math.max(1, m),
      });
}

/** 権限 1 件。持っている / 持っていないを、色と枠でひと目で分ける。 */
function PermissionCard({ row }: { row: MyPermissionRow }) {
  const tr = useTranslations();
  return (
    <Card
      padding="sm"
      radius="md"
      style={{
        borderLeft: `4px solid var(--mantine-color-${row.granted ? "green" : "gray"}-${row.granted ? 6 : 3})`,
        opacity: row.granted ? 1 : 0.75,
      }}
      withBorder
    >
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Group align="flex-start" gap="sm" wrap="nowrap">
          <ThemeIcon
            color={row.granted ? "green" : "gray"}
            radius="xl"
            size="sm"
            variant="light"
          >
            {row.granted ? <IconCheck size={14} /> : <IconX size={14} />}
          </ThemeIcon>
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="wrap">
              <Text fw={600} size="sm">
                {row.label}
              </Text>
              <Text c="dimmed" ff="mono" size="xs">
                {row.code}
              </Text>
              {row.canApprove && (
                <Badge color="violet" variant="light">
                  {tr("profile.myPermissionsView.youCanApprove")}
                </Badge>
              )}
            </Group>
            <Text c="dimmed" size="xs">
              {row.summary}
            </Text>
          </Stack>
        </Group>

        <Group gap={4} justify="flex-end" style={{ flexShrink: 0 }} wrap="wrap">
          {row.granted ? (
            row.actions.map((a) => (
              <Badge color="blue" key={a} variant="light">
                {actionLabel(a)}
              </Badge>
            ))
          ) : (
            <Badge color="gray" variant="outline">
              {tr("profile.myPermissionsView.noPermission")}
            </Badge>
          )}
        </Group>
      </Group>

      {row.granted && row.scopes.length > 0 && (
        <Text c="dimmed" mt={6} size="xs">
          {tr("profile.myPermissionsView.scopeLabel", {
            scopes: row.scopes.map((s) => scopeLabel(s)).join(" / "),
          })}
        </Text>
      )}

      {/* 特権操作 — 権限を持っていても、承認を受けた期間だけ実行できる。 */}
      {row.operations.length > 0 && (
        <Stack gap={4} mt="xs">
          {row.operations.map((op) => {
            // 未使用（ARMED）の付与で窓の残りを出すと、1 回あたりの持ち時間より
            // 長く見えて誤解を招く。時計が動いてから（ACTIVE）だけ残りを出す。
            const remaining =
              op.state === "ACTIVE" ? remainingLabel(op.remainingMs, tr) : null;
            return (
              <Group gap="xs" key={op.key} wrap="nowrap">
                {op.allowed ? (
                  <Badge
                    color={op.viaAdmin ? "blue" : "green"}
                    variant="filled"
                  >
                    {op.viaAdmin
                      ? tr("profile.myPermissionsView.administratorRights")
                      : (remaining ??
                        tr("profile.myPermissionsView.availableUnused"))}
                  </Badge>
                ) : op.pending ? (
                  <Badge
                    color="yellow"
                    leftSection={<IconClock size={11} />}
                    variant="light"
                  >
                    {tr("common.pendingApproval")}
                  </Badge>
                ) : (
                  <Badge
                    color="gray"
                    leftSection={<IconLock size={11} />}
                    variant="light"
                  >
                    {op.canRequest
                      ? tr("profile.myPermissionsView.requestRequired")
                      : tr("profile.myPermissionsView.noPermission")}
                  </Badge>
                )}
                <Text size="xs">{op.label}</Text>
              </Group>
            );
          })}
        </Stack>
      )}
    </Card>
  );
}

export function MyPermissionsView({ view }: { view: View }) {
  const tr = useTranslations();
  return (
    <ListShell
      breadcrumbs={[
        tr("common.profile"),
        tr("profile.myPermissionsView.myPermissions"),
      ]}
      title={tr("profile.myPermissionsView.myPermissions")}
    >
      {view.superuser ? (
        <Alert
          color="blue"
          icon={<IconShieldCheck size={16} />}
          mb="md"
          title={tr("profile.myPermissionsView.administrator")}
          variant="light"
        >
          <Text size="sm">
            {tr("profile.myPermissionsView.theyHoldEveryPermissionTheyCan")}
          </Text>
        </Alert>
      ) : (
        <Alert
          color="gray"
          icon={<IconInfoCircle size={16} />}
          mb="md"
          variant="light"
        >
          <Text size="sm">
            いま持っているのは {view.totalCount} 件中{" "}
            <b>{view.grantedCount} 件</b>
            です。権限は役割（ロール）を通して付きます。足りないときは管理者に
            相談してください。読み方は{" "}
            <Link href="/manual/ja/permissions">
              {tr("profile.myPermissionsView.permissionsAndRolesInTheManual")}
            </Link>
            {tr("profile.myPermissionsView.isWhereItLives")}
          </Text>
        </Alert>
      )}

      <Stack gap="lg">
        {view.groups.map(({ group, rows }) => (
          <Stack gap="xs" key={group}>
            <Group gap="xs">
              <Title c="dimmed" order={5}>
                {PERMISSION_GROUP_LABEL[group].ja}
              </Title>
              <Text c="dimmed" size="xs">
                {rows.filter((r) => r.granted).length} / {rows.length}
              </Text>
            </Group>
            {group === "privileged" && (
              <Paper bg="var(--mantine-color-gray-0)" p="xs" radius="sm">
                <Text size="xs">
                  {tr("profile.myPermissionsView.evenIfYouHoldThePermission")}
                  <b>{tr("profile.myPermissionsView.itCannotBeRunAsIt")}</b>。
                  <Link href="/settings/privileged-access">
                    {tr("common.privilegedAccess")}
                  </Link>
                  {tr("profile.myPermissionsView.andCanOnlyBeDoneFor")}
                </Text>
              </Paper>
            )}
            {rows.map((row) => (
              <PermissionCard key={row.code} row={row} />
            ))}
          </Stack>
        ))}
      </Stack>
    </ListShell>
  );
}
