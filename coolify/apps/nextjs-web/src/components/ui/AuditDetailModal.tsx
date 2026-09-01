"use client";

/**
 * AuditDetailModal — 履歴 1 件の詳細ポップアップ。
 *
 * 履歴タブ（AuditTimeline）の行をクリックすると開く。誰が・いつ・どの端末で・
 * 何を変えたかを 1 画面で見せる。変更点は before/after を突き合わせた
 * フィールド単位の表で示し、生データは折りたたみ（普段は畳んでおく）。
 *
 * SY07 の詳細ページ（ActivityLogDetail）と役割は同じだが、こちらは画面遷移
 * なしで確認するためのもの。
 */

import { Badge, Group, Modal, Paper, Stack, Text } from "@mantine/core";
import { IconDeviceTablet } from "@tabler/icons-react";
import { AuditChangeTable } from "./AuditChangeTable";
import { FieldValue } from "./FieldValue";
import type { AuditEntry } from "./shells";
import { UserAvatar } from "./UserAvatar";

export function AuditDetailModal({
  entry,
  onClose,
}: {
  /** 表示対象（null なら閉じた状態）。 */
  entry: AuditEntry | null;
  onClose: () => void;
}) {
  // 差分が取れない（CREATE/DELETE、メモだけの記録）ときは after をそのまま出す。
  const note =
    entry?.after && typeof entry.after === "object"
      ? ((entry.after as Record<string, unknown>).note as string | undefined)
      : undefined;

  return (
    <Modal
      onClose={onClose}
      opened={entry !== null}
      size="lg"
      title="操作の詳細"
    >
      {entry && (
        <Stack gap="md">
          <Paper p="md" radius="md" withBorder>
            <Group align="center" gap="sm" mb="sm" wrap="nowrap">
              <UserAvatar
                name={entry.user}
                size={32}
                thumbSrc={entry.avatarUrl}
              />
              <Stack gap={0} style={{ minWidth: 0 }}>
                <Text fw={600} size="sm">
                  {entry.user}
                </Text>
                <Text c="dimmed" size="xs">
                  {entry.at}
                </Text>
              </Stack>
              {entry.device && (
                <Badge
                  color="grape"
                  leftSection={<IconDeviceTablet size={11} />}
                  size="sm"
                  variant="light"
                >
                  {entry.device}
                </Badge>
              )}
            </Group>
            <Group gap="xl">
              <FieldValue label="操作" value={entry.action} />
              {entry.tableLabel && (
                <FieldValue label="対象" value={entry.tableLabel} />
              )}
              {entry.recordId && (
                <FieldValue
                  label="レコード"
                  value={
                    <Text ff="mono" size="sm">
                      {entry.recordId}
                    </Text>
                  }
                />
              )}
            </Group>
          </Paper>

          {/* 変更点と生データは共通部品（SY07 の詳細と同じ見せ方）。 */}
          <AuditChangeTable
            action={entry.action}
            after={entry.after}
            before={entry.before}
            emptyMessage={
              (typeof note === "string" ? note : undefined) ??
              (typeof entry.detail === "string" ? entry.detail : undefined) ??
              "詳細はありません"
            }
            tableName={entry.tableName}
          />
        </Stack>
      )}
    </Modal>
  );
}
