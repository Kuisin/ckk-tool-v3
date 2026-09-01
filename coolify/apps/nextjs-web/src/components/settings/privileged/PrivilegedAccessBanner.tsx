import { Alert, Anchor, Badge, Group, Stack, Text } from "@mantine/core";
import { IconShieldCheck, IconShieldLock } from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import { peekElevations } from "@/lib/privileged-access";
import {
  ELEVATION_CODE_LABEL,
  type ElevationCode,
  operationsForCode,
} from "@/lib/privileged-operations";

/**
 * PrivilegedAccessBanner — その画面の特権操作が「いま使えるか」を先に見せる。
 *
 * サーバーコンポーネント。**peekElevations しか呼ばない**ので、この帯を描いても
 * 誰の持ち時間も動かない（時計が動くのは実際に操作したとき）。
 *
 * 押してから赤いトーストで断られるより、開いた時点で「何が使えて、何には申請が
 * 要るか」が見えているほうがいい。管理者には何も出さない — 素通しなので情報が
 * 増えない。
 */
export async function PrivilegedAccessBanner({
  code,
}: {
  code: ElevationCode;
}) {
  const tr = await getTranslations();
  const ops = operationsForCode(code);
  const views = await peekElevations(ops.map((o) => o.key));
  const entries = ops.map((o) => ({ op: o, view: views[o.key] }));

  // 管理者（素通し）や、そもそも申請する資格が無い人には出さない。
  if (entries.every((e) => e.view?.viaAdmin)) return null;
  if (entries.every((e) => !e.view?.canRequest)) return null;

  const allowed = entries.filter((e) => e.view?.allowed);
  const pending = entries.filter((e) => e.view?.pending);
  const label = ELEVATION_CODE_LABEL[code].ja;

  // 未使用の付与では remainingMs が窓の終わりまでを指す。持ち時間と取り違え
  // られるので、時計が動いてから（ACTIVE）だけ残りを出す。
  const remainingLabel = (
    ms: number | null | undefined,
    state?: string | null,
  ) => {
    if (state !== "ACTIVE") return null;
    if (ms == null || ms <= 0) return null;
    const m = Math.floor(ms / 60_000);
    return m >= 60
      ? tr("settings.privilegedAccessBanner.remainingHM", {
          hours: Math.floor(m / 60),
          minutes: m % 60,
        })
      : tr("settings.privilegedAccessBanner.remainingM", {
          minutes: Math.max(1, m),
        });
  };

  return (
    <Alert
      color={allowed.length > 0 ? "green" : "gray"}
      icon={
        allowed.length > 0 ? (
          <IconShieldCheck size={16} />
        ) : (
          <IconShieldLock size={16} />
        )
      }
      mb="md"
      title={
        allowed.length > 0
          ? tr("settings.privilegedAccessBanner.labelNOperationsAreAvailable", {
              label,
              count: allowed.length,
            })
          : tr("settings.privilegedAccessBanner.labelNoOperationsAreApproved", {
              label,
            })
      }
      variant="light"
    >
      <Stack gap="xs">
        <Group gap="xs" wrap="wrap">
          {entries.map(({ op, view }) => (
            <Badge
              color={
                view?.allowed ? "green" : view?.pending ? "yellow" : "gray"
              }
              key={op.key}
              variant={view?.allowed ? "filled" : "light"}
            >
              {op.label.ja}
              {view?.allowed && remainingLabel(view.remainingMs, view.state)
                ? `（${remainingLabel(view.remainingMs, view.state)}）`
                : view?.pending
                  ? tr("settings.privileged.pendingApproval")
                  : ""}
            </Badge>
          ))}
        </Group>
        <Text size="xs">
          {allowed.length > 0
            ? tr("settings.privileged.theClockStartsFromTheFirst")
            : tr("settings.privileged.theseOperationsNeedApproval")}
          {pending.length > 0 && (
            <>
              {" "}
              {tr("settings.privilegedAccessBanner.pleaseWaitForApprovalOfThe")}
            </>
          )}{" "}
          <Anchor href="/settings/privileged-access/new" size="xs">
            {tr("settings.privileged.requestPrivilegedAccess")}
          </Anchor>
        </Text>
      </Stack>
    </Alert>
  );
}
