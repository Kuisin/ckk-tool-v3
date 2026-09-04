"use client";

/**
 * PortalList — 取引先ポータルの一覧（表 ⇄ 行リスト）。
 *
 * **社内の `components/ui/DataTable` は使わない。** あちらは「表示する列」を
 * `app.user_view_settings`（= app.users の設定）へ保存する Server Action を
 * 呼ぶので、社員ではない主体（portal_accounts）で開くと、列を触るたびに
 * 保存できずエラー通知だけが出る。並べ替え・ページ送り・一括操作も社外の面
 * には要らない。
 *
 * ■ 狭い画面では表をやめる（design.md §8.1 / §20.2）
 * 列が 4〜5 あると 1 列が 60px ほどになり、書類番号が折り返して読めなくなる。
 * 狭いときは **1 行 = 区切り線で分けた 1 ブロック**にして、呼び出し側が
 * `mobile()` で「何を大きく出すか」を決める。表の列をそのまま縦へ積むのでは
 * なく、行ごとに主役（番号・製品名）と脇役（日付・金額）を選び直す。
 *
 * 判定は `useIsMobile()`（表と行リストは DOM が別物なので CSS では畳めない）。
 * SSR は desktop 側で描かれ、マウント後に切り替わる。
 */

import {
  Box,
  Divider,
  Stack,
  Table,
  Text,
  UnstyledButton,
} from "@mantine/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/useViewport";

export interface PortalListColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

export interface PortalListProps<T> {
  columns: PortalListColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** 行を開ける場合の行き先。null を返した行は開けない（リンクにしない）。 */
  href?: (row: T) => string | null;
  /** 狭い画面での 1 行の中身。 */
  mobile: (row: T) => ReactNode;
  /** 0 件のときの文（画面ごとに言うことが違うので必ず受け取る）。 */
  empty: string;
}

export function PortalList<T>({
  columns,
  rows,
  rowKey,
  href,
  mobile,
  empty,
}: PortalListProps<T>) {
  const isMobile = useIsMobile();

  if (rows.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {empty}
      </Text>
    );
  }

  if (isMobile) {
    return (
      <Stack gap={0}>
        {rows.map((row, index) => {
          const to = href?.(row) ?? null;
          const body = (
            <Box py="sm" style={{ minWidth: 0 }}>
              {mobile(row)}
            </Box>
          );
          return (
            <Box key={rowKey(row)}>
              {index > 0 ? <Divider /> : null}
              {to ? (
                <UnstyledButton
                  component={Link}
                  display="block"
                  href={to}
                  w="100%"
                >
                  {body}
                </UnstyledButton>
              ) : (
                body
              )}
            </Box>
          );
        })}
      </Stack>
    );
  }

  return (
    <Table highlightOnHover striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          {columns.map((c) => (
            <Table.Th key={c.key} ta={c.align ?? "left"}>
              {c.header}
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={rowKey(row)}>
            {columns.map((c) => (
              <Table.Td key={c.key} ta={c.align ?? "left"}>
                {c.render(row)}
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
