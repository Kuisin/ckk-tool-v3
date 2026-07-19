"use client";

/**
 * EditableCellTable — カスタマイズ系ページ共通の、行編集できるスリムな表.
 *
 * データ列（columns）+ 自動追加の削除列。セルの中身は renderCell が返す（TextInput
 * 等）。行の追加/削除ボタン付き。密なスペーシング（horizontal 6 / vertical 2, セル
 * padding 2）でコンパクトに見せる。ルックアップ表の行編集などで再利用する。
 */

import { ActionIcon, Table } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { GhostButton } from "@/components/ui/buttons";

export interface EditableColumn {
  header: ReactNode;
  minWidth?: number;
  width?: number;
}

export function EditableCellTable<T>({
  columns,
  rows,
  renderCell,
  onAddRow,
  onRemoveRow,
  addLabel = "行を追加",
  minTableWidth = 360,
  removeLabel = "行を削除",
}: {
  /** データ列（削除列は自動で末尾に付く）。 */
  columns: EditableColumn[];
  rows: T[];
  /** (row, rowIndex, colIndex) → セルの中身。colIndex は columns の並び。 */
  renderCell: (row: T, rowIndex: number, colIndex: number) => ReactNode;
  onAddRow: () => void;
  onRemoveRow: (rowIndex: number) => void;
  addLabel?: string;
  minTableWidth?: number;
  removeLabel?: string;
}) {
  return (
    <>
      <Table.ScrollContainer minWidth={minTableWidth}>
        <Table
          horizontalSpacing={6}
          verticalSpacing={2}
          withColumnBorders
          withTableBorder
        >
          <Table.Thead>
            <Table.Tr>
              {columns.map((c, ci) => (
                <Table.Th
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed column set, no stable id
                  key={ci}
                  style={{ minWidth: c.minWidth, width: c.width }}
                >
                  {c.header}
                </Table.Th>
              ))}
              <Table.Th style={{ width: 36 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row, ri) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows edited in place, no stable id
              <Table.Tr key={ri}>
                {columns.map((_, ci) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed column set, no stable id
                  <Table.Td key={ci} p={2}>
                    {renderCell(row, ri, ci)}
                  </Table.Td>
                ))}
                <Table.Td p={2}>
                  <ActionIcon
                    aria-label={removeLabel}
                    color="red"
                    onClick={() => onRemoveRow(ri)}
                    size="sm"
                    variant="subtle"
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <GhostButton
        leftSection={<IconPlus size={12} />}
        mt="xs"
        onClick={onAddRow}
        size="compact-xs"
      >
        {addLabel}
      </GhostButton>
    </>
  );
}
