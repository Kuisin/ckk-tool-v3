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

import {
  Badge,
  Code,
  Collapse,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconChevronDown, IconDeviceTablet } from "@tabler/icons-react";
import { useState } from "react";
import { GhostButton } from "./buttons";
import { FieldValue } from "./FieldValue";
import type { AuditEntry } from "./shells";
import { UserAvatar } from "./UserAvatar";

/** 表示用に値を整える（null/真偽/オブジェクトを読める形に）。 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "はい" : "いいえ";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

interface FieldDiff {
  key: string;
  before: unknown;
  after: unknown;
}

/** before/after を突き合わせて、変わったフィールドだけ返す。 */
function diffFields(before: unknown, after: unknown): FieldDiff[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  if (typeof b !== "object" || typeof a !== "object") return [];
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const diffs: FieldDiff[] = [];
  for (const key of keys) {
    if (formatValue(b[key]) === formatValue(a[key])) continue;
    diffs.push({ key, before: b[key], after: a[key] });
  }
  return diffs;
}

export function AuditDetailModal({
  entry,
  onClose,
}: {
  /** 表示対象（null なら閉じた状態）。 */
  entry: AuditEntry | null;
  onClose: () => void;
}) {
  const [rawOpen, setRawOpen] = useState(false);
  const diffs = entry ? diffFields(entry.before, entry.after) : [];
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

          {/* 変更点 — フィールド単位。無ければメモ／概要を出す。 */}
          {diffs.length > 0 ? (
            <ScrollArea.Autosize mah={320}>
              <Table highlightOnHover striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 160 }}>項目</Table.Th>
                    <Table.Th>変更前</Table.Th>
                    <Table.Th>変更後</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {diffs.map((d) => (
                    <Table.Tr key={d.key}>
                      <Table.Td>
                        <Text size="sm">{d.key}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text c="dimmed" size="sm">
                          {formatValue(d.before)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fw={500} size="sm">
                          {formatValue(d.after)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          ) : (
            <Paper p="md" radius="md" withBorder>
              <Text size="sm">
                {note ?? entry.detail ?? "詳細はありません"}
              </Text>
            </Paper>
          )}

          {/* 生データ（普段は畳む） */}
          {(entry.before != null || entry.after != null) && (
            <Stack gap="xs">
              <Group>
                <GhostButton
                  leftSection={<IconChevronDown size={14} />}
                  onClick={() => setRawOpen((v) => !v)}
                  size="xs"
                >
                  {rawOpen ? "生データを隠す" : "生データを表示"}
                </GhostButton>
              </Group>
              <Collapse expanded={rawOpen}>
                <Stack gap="xs">
                  {entry.before != null && (
                    <div>
                      <Text c="dimmed" fw={600} mb={4} size="xs">
                        変更前（before）
                      </Text>
                      <Code block style={{ whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(entry.before, null, 2)}
                      </Code>
                    </div>
                  )}
                  {entry.after != null && (
                    <div>
                      <Text c="dimmed" fw={600} mb={4} size="xs">
                        変更後（after）
                      </Text>
                      <Code block style={{ whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(entry.after, null, 2)}
                      </Code>
                    </div>
                  )}
                </Stack>
              </Collapse>
            </Stack>
          )}
        </Stack>
      )}
    </Modal>
  );
}
