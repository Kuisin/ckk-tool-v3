"use client";

/**
 * AuditChangeTable — 履歴の「何が変わったか」を**列名と値で**見せる。
 *
 * 生の JSON をそのまま出していた画面（SY07 の詳細）と、独自に差分表を持って
 * いた画面（履歴タブのポップアップ）を 1 つに寄せた部品。片方だけ直ると
 * 一覧と詳細で違う言葉が出るので、対応表（lib/audit-field-labels.ts）ごと共通にする。
 *
 * 約束ごと:
 *   - **既定は読める形**（項目 / 変更前 / 変更後 の表）
 *   - **生データは畳んで残す** — 整形は必ず何かを落とすので、元を見る道を塞がない
 *   - 差分が取れないとき（CREATE / DELETE / メモだけの記録）は、
 *     after をそのまま項目一覧として出す（空欄にしない）
 *   - **狭い画面では表をやめて 1 件 1 ブロックに積む**（design.md §20.2）。
 *     3 列を携帯に押し込むと項目名が 1 文字ずつ縦に折り返され、
 *     何の項目なのかが読めなくなる（実機でそうなっていた）
 */

import {
  Box,
  Code,
  Collapse,
  Divider,
  Group,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconArrowRight, IconChevronDown } from "@tabler/icons-react";
import { useState } from "react";
import { useIsMobile } from "@/hooks/useViewport";
import {
  auditFieldDiffs,
  auditFieldLabel,
  flattenAuditValue,
  formatAuditValue,
} from "@/lib/audit-field-labels";
import { GhostButton } from "./buttons";

type Props = {
  action: string;
  before: unknown;
  after: unknown;
  /** 列名の読み替えを表ごとに変えるため（display_devices.name = ディスプレイ名 等）。 */
  tableName?: string;
  /** 変更点が 1 つも無いときに出す文。 */
  emptyMessage?: string;
};

export function AuditChangeTable({
  action,
  before,
  after,
  tableName,
  emptyMessage = "変更点はありません",
}: Props) {
  const [rawOpen, setRawOpen] = useState(false);
  const isMobile = useIsMobile();
  const diffs = auditFieldDiffs(before, after, tableName);

  // CREATE / DELETE は「変わった列」という見方ができない（片側しか無い）。
  // 中身をそのまま項目一覧として出す。
  const single =
    diffs.length === 0 ? entriesOf(action === "DELETE" ? before : after) : null;

  return (
    <Stack gap="xs">
      {diffs.length > 0 ? (
        isMobile ? (
          <Stack gap={0}>
            {diffs.map((d, i) => (
              <Box key={d.key}>
                {i > 0 && <Divider />}
                <Stack gap={2} py="xs">
                  <Text fw={600} size="sm">
                    {d.label}
                  </Text>
                  <Group align="center" gap="xs" wrap="nowrap">
                    <Text c="dimmed" size="sm" style={{ minWidth: 0 }}>
                      {formatAuditValue(d.before, d.key)}
                    </Text>
                    <IconArrowRight
                      size={14}
                      style={{ flexShrink: 0, opacity: 0.5 }}
                    />
                    <Text fw={500} size="sm" style={{ minWidth: 0 }}>
                      {formatAuditValue(d.after, d.key)}
                    </Text>
                  </Group>
                </Stack>
              </Box>
            ))}
          </Stack>
        ) : (
          <Table highlightOnHover striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 180 }}>項目</Table.Th>
                <Table.Th>変更前</Table.Th>
                <Table.Th>変更後</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {diffs.map((d) => (
                <Table.Tr key={d.key}>
                  <Table.Td>
                    <Text size="sm">{d.label}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" size="sm">
                      {formatAuditValue(d.before, d.key)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fw={500} size="sm">
                      {formatAuditValue(d.after, d.key)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )
      ) : single && single.length > 0 ? (
        isMobile ? (
          <Stack gap={0}>
            {single.map(([key, value], i) => (
              <Box key={key}>
                {i > 0 && <Divider />}
                <Stack gap={2} py="xs">
                  <Text c="dimmed" size="xs">
                    {auditFieldLabel(key, tableName)}
                  </Text>
                  <Text size="sm">{formatAuditValue(value, key)}</Text>
                </Stack>
              </Box>
            ))}
          </Stack>
        ) : (
          <Table highlightOnHover striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 180 }}>項目</Table.Th>
                <Table.Th>値</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {single.map(([key, value]) => (
                <Table.Tr key={key}>
                  <Table.Td>
                    <Text size="sm">{auditFieldLabel(key, tableName)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatAuditValue(value, key)}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )
      ) : (
        <Text c="dimmed" size="sm">
          {emptyMessage}
        </Text>
      )}

      {/* 生データ — 整形は必ず何かを落とすので、元を見る道は残す */}
      {(before != null || after != null) && (
        <>
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
              {before != null && (
                <div>
                  <Text c="dimmed" fw={600} mb={4} size="xs">
                    変更前（before）
                  </Text>
                  <Code block style={{ whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(before, null, 2)}
                  </Code>
                </div>
              )}
              {after != null && (
                <div>
                  <Text c="dimmed" fw={600} mb={4} size="xs">
                    変更後（after）
                  </Text>
                  <Code block style={{ whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(after, null, 2)}
                  </Code>
                </div>
              )}
            </Stack>
          </Collapse>
        </>
      )}
    </Stack>
  );
}

/**
 * オブジェクトを [キー, 値] の並びに。**入れ子は平らにする** —
 * そうしないと CREATE の記録で設定オブジェクトが JSON のまま 1 行に出る。
 */
function entriesOf(value: unknown): Array<[string, unknown]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(flattenAuditValue(value));
}
