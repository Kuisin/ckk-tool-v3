"use client";

/**
 * FormTasksPanel — 承認・予定 (CM01) のフォーム関連の一覧（3 つ）。
 *
 *   未回答のフォーム … 自分が答えるべきもの
 *   回答済みのフォーム … 自分が出したもの（回答者を表示しないフォームでも
 *     自分の分は自分に見える。他人には出ない）
 *   完了した申請 … 自分宛に届いた完了通知（lib/form-completion.ts）
 *
 * どの行も **スマホでは横並びをやめて縦に積む**（design.md §20.2）。
 * タイトル・No.・状態・日付を 1 行に押し込むと、幅 375px ではタイトルが
 * 数文字で切れて何のフォームか分からなくなる。
 */

import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { IconForms } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { CompletedRequestRow } from "@/app/(dashboard)/general/tasks/completions-data";
import type {
  MyResponseRow,
  PendingFormRow,
} from "@/app/(dashboard)/general/tasks/forms-data";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIsMobile } from "@/hooks/useViewport";

function Empty({ message }: { message: string }) {
  return (
    <Paper p="md" radius="md" withBorder>
      <EmptyState icon={<IconForms size={28} />} message={message} />
    </Paper>
  );
}

/**
 * 一覧の 1 行。PC は「主内容 | 右端の補足」の横並び、スマホは縦積み。
 * 未読の行は左に 3px の青線を引く（design.md §1.1）。
 */
function Row({
  onClick,
  main,
  trailing,
  unread = false,
}: {
  onClick: () => void;
  main: ReactNode;
  trailing?: ReactNode;
  unread?: boolean;
}) {
  const isMobile = useIsMobile();
  return (
    <Paper
      onClick={onClick}
      p="sm"
      radius="sm"
      style={{
        cursor: "pointer",
        ...(unread
          ? { borderLeft: "3px solid var(--mantine-color-blue-5)" }
          : {}),
      }}
      withBorder
    >
      {isMobile ? (
        <Stack gap={6}>
          {main}
          {trailing && (
            <Group gap="xs" justify="space-between" wrap="wrap">
              {trailing}
            </Group>
          )}
        </Stack>
      ) : (
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" style={{ minWidth: 0 }} wrap="nowrap">
            {main}
          </Group>
          <Group gap="xs" style={{ flexShrink: 0 }} wrap="nowrap">
            {trailing}
          </Group>
        </Group>
      )}
    </Paper>
  );
}

export function PendingFormsList({ rows }: { rows: PendingFormRow[] }) {
  const tr = useTranslations();
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();

  if (rows.length === 0)
    return (
      <Empty message={tr("general.formTasksPanel.thereAreNoFormsAwaitingA")} />
    );

  return (
    <Stack gap="xs">
      {rows.map((row) => (
        <Row
          key={row.code}
          main={
            isMobile ? (
              <Text fw={600} size="sm">
                {row.title}
              </Text>
            ) : (
              <>
                <Text fw={600} size="sm" truncate>
                  {row.title}
                </Text>
                <Badge
                  color={row.kind === "REQUEST" ? "indigo" : "cyan"}
                  size="sm"
                  variant="light"
                >
                  {row.kind === "REQUEST"
                    ? tr("common.requestOrReport")
                    : tr("common.survey")}
                </Badge>
              </>
            )
          }
          onClick={() => router.push(`/f/${row.code}`)}
          trailing={
            <>
              {isMobile && (
                <Badge
                  color={row.kind === "REQUEST" ? "indigo" : "cyan"}
                  size="sm"
                  variant="light"
                >
                  {row.kind === "REQUEST"
                    ? tr("common.requestOrReport")
                    : tr("common.survey")}
                </Badge>
              )}
              <Text c="dimmed" size="xs">
                {row.closesAt
                  ? tr("general.formTasksPanel.deadlineUntil", {
                      datetime: fmt.dateTime(row.closesAt),
                    })
                  : tr("general.formTasksPanel.noDeadline")}
              </Text>
            </>
          }
        />
      ))}
    </Stack>
  );
}

export function MyResponsesList({ rows }: { rows: MyResponseRow[] }) {
  const tr = useTranslations();
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();

  if (rows.length === 0)
    return (
      <Empty
        message={tr("general.formTasksPanel.youHaveNotAnsweredAnyForms")}
      />
    );

  return (
    <Stack gap="xs">
      {rows.map((row) => (
        <Row
          key={row.responseNumber}
          main={
            isMobile ? (
              <Stack gap={4}>
                <Text fw={600} size="sm">
                  {row.formTitle}
                </Text>
                {row.recordTitle && (
                  <Text c="dimmed" size="xs" truncate>
                    {row.recordTitle}
                  </Text>
                )}
                <Group gap="xs" wrap="wrap">
                  <Text c="dimmed" className="tabular-nums" size="xs">
                    No. {row.recordNo}
                  </Text>
                  <StatusBadge entity="FormResponse" status={row.status} />
                </Group>
              </Stack>
            ) : (
              <>
                <Stack gap={0} style={{ minWidth: 0 }}>
                  <Text fw={600} size="sm" truncate>
                    {row.formTitle}
                  </Text>
                  {row.recordTitle && (
                    <Text c="dimmed" size="xs" truncate>
                      {row.recordTitle}
                    </Text>
                  )}
                </Stack>
                <Text c="dimmed" className="tabular-nums" size="xs">
                  No. {row.recordNo}
                </Text>
                <StatusBadge entity="FormResponse" status={row.status} />
              </>
            )
          }
          onClick={() =>
            router.push(
              `/general/forms/${row.formCode}/responses/${row.responseNumber}`,
            )
          }
          trailing={
            <>
              {row.canEdit && (
                <Badge color="blue" size="sm" variant="light">
                  {row.editDeadline
                    ? tr("general.formTasksPanel.editableUntil", {
                        datetime: fmt.dateTime(row.editDeadline),
                      })
                    : tr("general.formTasksPanel.editable")}
                </Badge>
              )}
              <Text c="dimmed" size="xs">
                {row.submittedAt
                  ? fmt.dateTime(row.submittedAt)
                  : tr("common.draft")}
              </Text>
            </>
          }
        />
      ))}
    </Stack>
  );
}

/**
 * 自分宛に届いた「完了した申請・報告」。誰に届くかはフォームの共有設定
 * （完了通知を付けた共有行）が決める。未読は左の青線とバッジで示し、
 * その回答を開いた時点で既読になる（押す操作は無い）。
 */
export function CompletedRequestsList({
  rows,
}: {
  rows: CompletedRequestRow[];
}) {
  const tr = useTranslations();
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();

  if (rows.length === 0)
    return (
      <Empty message={tr("general.formTasksPanel.thereIsNoCompletionNotice")} />
    );

  return (
    <Stack gap="xs">
      {rows.map((row) => {
        const meta = (
          <Group gap="xs" wrap="wrap">
            <Text c="dimmed" className="tabular-nums" size="xs">
              No. {row.recordNo}
            </Text>
            <StatusBadge entity="FormResponse" status={row.status} />
            {row.respondent && (
              <Text c="dimmed" size="xs" truncate>
                {row.respondent}
              </Text>
            )}
          </Group>
        );
        return (
          <Row
            key={row.responseNumber}
            main={
              isMobile ? (
                <Stack gap={4}>
                  <Stack gap={0}>
                    <Text fw={row.readAt ? 500 : 700} size="sm">
                      {row.formTitle}
                    </Text>
                    {row.recordTitle && (
                      <Text c="dimmed" size="xs" truncate>
                        {row.recordTitle}
                      </Text>
                    )}
                  </Stack>
                  {meta}
                </Stack>
              ) : (
                <>
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text fw={row.readAt ? 500 : 700} size="sm" truncate>
                      {row.formTitle}
                    </Text>
                    {row.recordTitle && (
                      <Text c="dimmed" size="xs" truncate>
                        {row.recordTitle}
                      </Text>
                    )}
                  </Stack>
                  {meta}
                </>
              )
            }
            onClick={() =>
              router.push(
                `/general/forms/${row.formCode}/responses/${row.responseNumber}`,
              )
            }
            trailing={
              <>
                {!row.readAt && (
                  <Badge color="blue" size="sm" variant="light">
                    {tr("general.formTasksPanel.unread")}
                  </Badge>
                )}
                <Text c="dimmed" size="xs">
                  {fmt.dateTime(row.notifiedAt)}
                </Text>
              </>
            }
            unread={!row.readAt}
          />
        );
      })}
    </Stack>
  );
}
