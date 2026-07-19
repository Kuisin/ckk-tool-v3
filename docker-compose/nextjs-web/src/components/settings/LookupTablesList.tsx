"use client";

/**
 * LookupTablesList — 試算計算（SY02）ルックアップ表の一覧（閲覧モード）。
 *
 * 表はここでは編集しない。各行は詳細（編集）ページを別ウィンドウ（新規タブ）で開き、
 * 一覧と詳細を並べて確認できるようにする。式内では lookup("表名", key...) で参照。
 */

import { Anchor, Badge, Group, Paper, Stack, Table, Text } from "@mantine/core";
import { IconExternalLink, IconPlus } from "@tabler/icons-react";
import { PrimaryButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import type { LookupKeyMatch, LookupTable } from "@/lib/trial-pricing-criteria";

const BASE = "/settings/trial-pricing-engine";

const MATCH_LABEL: Record<LookupKeyMatch, string> = {
  exact: "完全一致",
  ge: "≥（以上で最小）",
  le: "≤（以下で最大）",
};
const MATCH_COLOR: Record<LookupKeyMatch, string> = {
  exact: "gray",
  ge: "blue",
  le: "teal",
};

export function LookupTablesList({ tables }: { tables: LookupTable[] }) {
  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <PrimaryButton
            href={`${BASE}/lookups/new`}
            leftSection={<IconPlus size={16} />}
          >
            新規表
          </PrimaryButton>
        }
        breadcrumbs={[
          "システム",
          { label: "試算計算", href: BASE },
          "ルックアップ表",
        ]}
        title="ルックアップ表"
      />
      <Text c="dimmed" size="sm">
        キー列の組み合わせから戻り値を引く参照表です。行をクリックすると、その表の編集
        ページを<b>別ウィンドウ</b>
        で開きます（一覧と詳細を並べて編集できます）。式内では lookup("表名",
        キー1, キー2, ...) で参照します。
      </Text>

      <Paper p={0} radius="md" withBorder>
        <Table.ScrollContainer minWidth={720}>
          <Table highlightOnHover stickyHeader striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>表名</Table.Th>
                <Table.Th>キー列（照合）</Table.Th>
                <Table.Th>型</Table.Th>
                <Table.Th ta="right">行数</Table.Th>
                <Table.Th>既定値</Table.Th>
                <Table.Th w={48} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tables.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text c="dimmed" py="md" size="sm" ta="center">
                      表がありません。「新規表」から作成してください。
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {tables.map((t) => {
                const href = `${BASE}/lookups/${encodeURIComponent(t.id)}`;
                return (
                  <Table.Tr key={t.id}>
                    <Table.Td>
                      <Anchor
                        ff="monospace"
                        fw={600}
                        href={href}
                        rel="noopener"
                        size="sm"
                        target="_blank"
                      >
                        {t.name || "(無名)"}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="wrap">
                        {t.keyColumns.map((c, i) => {
                          const mode: LookupKeyMatch =
                            t.keyMatch?.[i] ?? "exact";
                          return (
                            <Badge
                              color={MATCH_COLOR[mode]}
                              key={`${t.id}-${c}-${i}`}
                              size="sm"
                              variant="light"
                            >
                              {c} · {MATCH_LABEL[mode]}
                            </Badge>
                          );
                        })}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {t.valueType === "number" ? "数値" : "文字列"}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text ff="monospace" size="sm">
                        {t.rows.length}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text c="dimmed" size="sm">
                        {t.default ?? (t.valueType === "number" ? "0" : "—")}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Anchor
                        aria-label="別ウィンドウで開く"
                        href={href}
                        rel="noopener"
                        target="_blank"
                      >
                        <IconExternalLink size={16} />
                      </Anchor>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
    </Stack>
  );
}
