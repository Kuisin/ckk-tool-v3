/**
 * data-table.tsx — Unified rich table for every list page (maintainability).
 *
 * Stands in for `mantine-datatable` in production (design.md §14). Features:
 *  - column-header sorting (asc/desc indicators, client-side)
 *  - pagination (page size selector + range label)
 *  - row selection (checkbox + select-all/indeterminate) → bulk action bar
 *  - per-row actions (trailing menu)
 *  - column visibility toggle + density toggle
 *  - sticky header, row click → detail
 *  - responsive: desktop table ↔ mobile card list (via `renderCard`)
 *
 * One component drives all ~25 list screens so table behaviour stays consistent.
 */

import { type ReactNode, useMemo, useState } from 'react';
import {
  ActionIcon,
  Box,
  Center,
  Checkbox,
  Group,
  Menu,
  Pagination,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconAdjustmentsHorizontal,
  IconArrowsSort,
  IconChevronDown,
  IconChevronUp,
  IconColumns3,
  IconDotsVertical,
  IconInbox,
} from '@tabler/icons-react';
import { useIsMobile } from './viewport-context';

export type SortDir = 'asc' | 'desc';

export interface Column<T> {
  /** Unique key, also used as the sort key. */
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  /** Value used for client-side sorting; defaults to the rendered string. */
  sortValue?: (row: T) => string | number;
  /** Can be hidden via the column-visibility menu. */
  hideable?: boolean;
}

export interface BulkAction<T> {
  label: string;
  icon?: ReactNode;
  color?: string;
  onAction?: (rows: T[]) => void;
}

export interface RowAction<T> {
  label: string;
  icon?: ReactNode;
  color?: string;
  onAction?: (row: T) => void;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Mobile card renderer; falls back to a generic two-line card if omitted. */
  renderCard?: (row: T) => ReactNode;
  selectable?: boolean;
  bulkActions?: BulkAction<T>[];
  rowActions?: (row: T) => RowAction<T>[];
  pageSize?: number;
  defaultSort?: { key: string; dir: SortDir };
  stickyHeader?: boolean;
  emptyIcon?: ReactNode;
  emptyMessage?: string;
  emptyAction?: ReactNode;
}

const PAGE_SIZES = ['10', '20', '50', '100'];

export function DataTable<T>({
  data,
  columns,
  getRowId,
  onRowClick,
  renderCard,
  selectable = false,
  bulkActions = [],
  rowActions,
  pageSize: initialPageSize = 10,
  defaultSort,
  stickyHeader = true,
  emptyIcon,
  emptyMessage = 'データがありません',
  emptyAction,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(defaultSort ?? null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [compact, setCompact] = useState(false);

  const visibleColumns = columns.filter((c) => !hidden.has(c.key));

  // ── Sorting ────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return data;
    const valueOf = (row: T): string | number => {
      if (col.sortValue) return col.sortValue(row);
      const r = col.render(row);
      return typeof r === 'string' || typeof r === 'number' ? r : String(r ?? '');
    };
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [data, sort, columns]);

  // ── Pagination ───────────────────────────────────────────────────────────--
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  // ── Selection ───────────────────────────────────────────────────────────---
  const pageIds = pageRows.map(getRowId);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));
  const selectedRows = sorted.filter((r) => selected.has(getRowId(r)));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null; // third click clears
    });
  };

  // ── Empty state ──────────────────────────────────────────────────────────--
  if (total === 0) {
    return (
      <Center py="xl">
        <Stack align="center" gap="sm">
          <ThemeIcon size="xl" variant="light" color="gray">
            {emptyIcon ?? <IconInbox size={24} />}
          </ThemeIcon>
          <Text c="dimmed" size="sm">{emptyMessage}</Text>
          {emptyAction}
        </Stack>
      </Center>
    );
  }

  // ── Toolbar (bulk bar / column + density controls) ──────────────────────────
  const toolbar = (
    <Group justify="space-between" mb="xs" wrap="nowrap">
      <Box style={{ minWidth: 0 }}>
        {selectable && selected.size > 0 && (
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={600}>{selected.size}件選択中</Text>
            {bulkActions.map((a) => (
              <ActionIcon.Group key={a.label}>
                <Tooltip label={a.label} withinPortal>
                  <ActionIcon
                    variant="light"
                    color={a.color ?? 'blue'}
                    onClick={() => a.onAction?.(selectedRows)}
                    aria-label={a.label}
                  >
                    {a.icon ?? <IconAdjustmentsHorizontal size={16} />}
                  </ActionIcon>
                </Tooltip>
              </ActionIcon.Group>
            ))}
            <Text size="xs" c="dimmed" style={{ cursor: 'pointer' }} onClick={() => setSelected(new Set())}>
              選択解除
            </Text>
          </Group>
        )}
      </Box>
      {!isMobile && (
        <Group gap={4} wrap="nowrap">
          <Tooltip label={compact ? '標準表示' : 'コンパクト表示'} withinPortal>
            <ActionIcon variant="subtle" color="gray" onClick={() => setCompact((v) => !v)} aria-label="表示密度">
              <IconAdjustmentsHorizontal size={16} />
            </ActionIcon>
          </Tooltip>
          {columns.some((c) => c.hideable) && (
            <Menu shadow="md" withinPortal closeOnItemClick={false} position="bottom-end">
              <Menu.Target>
                <Tooltip label="列の表示" withinPortal>
                  <ActionIcon variant="subtle" color="gray" aria-label="列の表示">
                    <IconColumns3 size={16} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>表示する列</Menu.Label>
                {columns.filter((c) => c.hideable).map((c) => (
                  <Menu.Item key={c.key} onClick={() => {
                    setHidden((prev) => {
                      const next = new Set(prev);
                      next.has(c.key) ? next.delete(c.key) : next.add(c.key);
                      return next;
                    });
                  }}>
                    <Checkbox
                      size="xs"
                      label={typeof c.header === 'string' ? c.header : c.key}
                      checked={!hidden.has(c.key)}
                      readOnly
                    />
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      )}
    </Group>
  );

  // ── Mobile card list ────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <Stack gap="xs">
        {toolbar}
        {pageRows.map((row) => {
          const id = getRowId(row);
          return (
            <Box key={id} pos="relative">
              {selectable && (
                <Checkbox
                  size="xs"
                  checked={selected.has(id)}
                  onChange={() => toggleOne(id)}
                  pos="absolute"
                  top={10}
                  right={10}
                  style={{ zIndex: 2 }}
                  aria-label="行を選択"
                />
              )}
              <Box onClick={() => onRowClick?.(row)} style={{ cursor: onRowClick ? 'pointer' : undefined }}>
                {renderCard ? renderCard(row) : <DefaultCard columns={visibleColumns} row={row} />}
              </Box>
            </Box>
          );
        })}
        <PaginationBar
          total={total}
          start={start}
          count={pageRows.length}
          page={safePage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(v) => { setPageSize(v); setPage(1); }}
          isMobile
        />
      </Stack>
    );
  }

  // ── Desktop table ─────────────────────────────────────────────────────────--
  const cellPad = compact ? { paddingTop: 4, paddingBottom: 4 } : undefined;

  return (
    <Stack gap="xs">
      {toolbar}
      <ScrollArea>
        <Table
          highlightOnHover={!!onRowClick}
          striped
          stickyHeader={stickyHeader}
          verticalSpacing={compact ? 4 : 'sm'}
        >
          <Table.Thead>
            <Table.Tr>
              {selectable && (
                <Table.Th style={{ width: 40 }}>
                  <Checkbox
                    size="xs"
                    checked={allOnPageSelected}
                    indeterminate={someOnPageSelected && !allOnPageSelected}
                    onChange={toggleAll}
                    aria-label="すべて選択"
                  />
                </Table.Th>
              )}
              {visibleColumns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <Table.Th
                    key={c.key}
                    style={{ width: c.width, textAlign: c.align, cursor: c.sortable ? 'pointer' : undefined }}
                    onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                  >
                    <Group gap={4} wrap="nowrap" justify={c.align === 'right' ? 'flex-end' : 'flex-start'}>
                      <Text size="xs" c="dimmed" fw={600} component="span">{c.header}</Text>
                      {c.sortable && (
                        active
                          ? (sort?.dir === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />)
                          : <IconArrowsSort size={12} style={{ opacity: 0.4 }} />
                      )}
                    </Group>
                  </Table.Th>
                );
              })}
              {rowActions && <Table.Th style={{ width: 48 }} />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pageRows.map((row) => {
              const id = getRowId(row);
              const actions = rowActions?.(row) ?? [];
              return (
                <Table.Tr
                  key={id}
                  style={{ cursor: onRowClick ? 'pointer' : undefined }}
                  bg={selected.has(id) ? 'var(--mantine-color-blue-0)' : undefined}
                >
                  {selectable && (
                    <Table.Td style={cellPad} onClick={(e) => e.stopPropagation()}>
                      <Checkbox size="xs" checked={selected.has(id)} onChange={() => toggleOne(id)} aria-label="行を選択" />
                    </Table.Td>
                  )}
                  {visibleColumns.map((c) => (
                    <Table.Td
                      key={c.key}
                      style={{ textAlign: c.align, ...cellPad }}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {c.render(row)}
                    </Table.Td>
                  ))}
                  {rowActions && (
                    <Table.Td style={cellPad} onClick={(e) => e.stopPropagation()}>
                      {actions.length > 0 && (
                        <Menu shadow="md" withinPortal position="bottom-end">
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" aria-label="操作">
                              <IconDotsVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            {actions.map((a) => (
                              <Menu.Item key={a.label} color={a.color} leftSection={a.icon} onClick={() => a.onAction?.(row)}>
                                {a.label}
                              </Menu.Item>
                            ))}
                          </Menu.Dropdown>
                        </Menu>
                      )}
                    </Table.Td>
                  )}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <PaginationBar
        total={total}
        start={start}
        count={pageRows.length}
        page={safePage}
        totalPages={totalPages}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={(v) => { setPageSize(v); setPage(1); }}
      />
    </Stack>
  );
}

// ── Pagination bar ────────────────────────────────────────────────────────────
function PaginationBar({
  total, start, count, page, totalPages, pageSize, onPage, onPageSize, isMobile,
}: {
  total: number; start: number; count: number; page: number; totalPages: number;
  pageSize: number; onPage: (p: number) => void; onPageSize: (s: number) => void; isMobile?: boolean;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" mt={4}>
      <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
        {total === 0 ? '0件' : `${start + 1}–${start + count} / ${total}件`}
      </Text>
      <Group gap="xs" wrap="nowrap">
        {!isMobile && (
          <Select
            size="xs"
            w={92}
            data={PAGE_SIZES.map((s) => ({ value: s, label: `${s}件` }))}
            value={String(pageSize)}
            onChange={(v) => v && onPageSize(Number(v))}
            allowDeselect={false}
            aria-label="表示件数"
          />
        )}
        <Pagination
          size="sm"
          value={page}
          total={totalPages}
          onChange={onPage}
          siblings={isMobile ? 0 : 1}
          withControls
        />
      </Group>
    </Group>
  );
}

// ── Generic fallback mobile card ───────────────────────────────────────────────
function DefaultCard<T>({ columns, row }: { columns: Column<T>[]; row: T }) {
  const [first, ...rest] = columns;
  return (
    <Paper p="sm" withBorder radius="sm">
      <Stack gap={4}>
        {first && <Text size="sm" fw={600}>{first.render(row)}</Text>}
        <Group gap="md" wrap="wrap">
          {rest.slice(0, 4).map((c) => (
            <Group key={c.key} gap={4}>
              <Text size="xs" c="dimmed">{c.header}:</Text>
              <Text size="xs">{c.render(row)}</Text>
            </Group>
          ))}
        </Group>
      </Stack>
    </Paper>
  );
}
