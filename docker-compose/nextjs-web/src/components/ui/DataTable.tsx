"use client";

/**
 * DataTable.tsx — Unified rich table for every list page (design.md §14).
 *
 * Ported from design-preview (designs/lib/data-table.tsx). Features:
 *  - column-header sorting (asc/desc indicators, client-side)
 *  - pagination (page size selector + range label)
 *  - row selection (checkbox + select-all/indeterminate) → bulk action bar
 *  - per-row actions (trailing menu)
 *  - column visibility toggle (compact density is always on)
 *  - sticky header, row click → detail
 *  - responsive: desktop table ↔ mobile card list (via `renderCard`)
 *
 * One component drives all ~25 list screens so table behaviour stays consistent.
 */

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
} from "@mantine/core";
import {
  IconAdjustmentsHorizontal,
  IconArrowsSort,
  IconChevronDown,
  IconChevronUp,
  IconColumns3,
  IconDotsVertical,
  IconInbox,
} from "@tabler/icons-react";
import { type ReactNode, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useViewport";

export type SortDir = "asc" | "desc";

export interface Column<T> {
  /** Unique key, also used as the sort key. */
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  width?: number | string;
  align?: "left" | "right" | "center";
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

const PAGE_SIZES = ["10", "20", "50", "100"];

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
  emptyMessage = "データがありません",
  emptyAction,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(
    defaultSort ?? null,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visibleColumns = columns.filter((c) => !hidden.has(c.key));
  const hideableColumns = columns.filter((c) => c.hideable);

  const toggleHidden = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Sorting ────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return data;
    const sortValueOf = (row: T): string | number => {
      if (col.sortValue) return col.sortValue(row);
      const r = col.render(row);
      return typeof r === "string" || typeof r === "number"
        ? r
        : String(r ?? "");
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = sortValueOf(a);
      const bv = sortValueOf(b);
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
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));
  const selectedRows = sorted.filter((r) => selected.has(getRowId(r)));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of pageIds) {
        if (allOnPageSelected) next.delete(id);
        else next.add(id);
      }
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
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null; // third click clears
    });
  };

  // ── Empty state ──────────────────────────────────────────────────────────--
  if (total === 0) {
    return (
      <Center py="xl">
        <Stack align="center" gap="sm">
          <ThemeIcon color="gray" size="xl" variant="light">
            {emptyIcon ?? <IconInbox size={24} />}
          </ThemeIcon>
          <Text c="dimmed" size="sm">
            {emptyMessage}
          </Text>
          {emptyAction}
        </Stack>
      </Center>
    );
  }

  // ── Toolbar (bulk bar / column + density controls) ──────────────────────────
  const toolbar = (
    <Group justify="space-between" mb="xs" wrap="nowrap">
      <Box className="min-w-0">
        {selectable && selected.size > 0 && (
          <Group gap="xs" wrap="nowrap">
            <Text fw={600} size="sm">
              {selected.size}件選択中
            </Text>
            {bulkActions.map((a) => (
              <ActionIcon.Group key={a.label}>
                <Tooltip label={a.label} withinPortal>
                  <ActionIcon
                    aria-label={a.label}
                    color={a.color ?? "blue"}
                    onClick={() => a.onAction?.(selectedRows)}
                    variant="light"
                  >
                    {a.icon ?? <IconAdjustmentsHorizontal size={16} />}
                  </ActionIcon>
                </Tooltip>
              </ActionIcon.Group>
            ))}
            <Text
              c="dimmed"
              className="cursor-pointer"
              onClick={() => setSelected(new Set())}
              size="xs"
            >
              選択解除
            </Text>
          </Group>
        )}
      </Box>
      {!isMobile && hideableColumns.length > 0 && (
        <Group gap={4} wrap="nowrap">
          <Menu
            closeOnItemClick={false}
            position="bottom-end"
            shadow="md"
            withinPortal
          >
            <Menu.Target>
              <Tooltip label="列の表示" withinPortal>
                <ActionIcon aria-label="列の表示" color="gray" variant="subtle">
                  <IconColumns3 size={16} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>表示する列</Menu.Label>
              <Stack gap="xs" px="sm" py={4}>
                {hideableColumns.map((c) => (
                  <Checkbox
                    checked={!hidden.has(c.key)}
                    key={c.key}
                    label={typeof c.header === "string" ? c.header : c.key}
                    onChange={() => toggleHidden(c.key)}
                    size="xs"
                  />
                ))}
              </Stack>
            </Menu.Dropdown>
          </Menu>
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
                  aria-label="行を選択"
                  checked={selected.has(id)}
                  className="z-[2]"
                  onChange={() => toggleOne(id)}
                  pos="absolute"
                  right={10}
                  size="xs"
                  top={10}
                />
              )}
              <Box
                className={onRowClick ? "cursor-pointer" : undefined}
                onClick={() => onRowClick?.(row)}
              >
                {renderCard ? (
                  renderCard(row)
                ) : (
                  <DefaultCard columns={visibleColumns} row={row} />
                )}
              </Box>
            </Box>
          );
        })}
        <PaginationBar
          count={pageRows.length}
          isMobile
          onPage={setPage}
          onPageSize={(v) => {
            setPageSize(v);
            setPage(1);
          }}
          page={safePage}
          pageSize={pageSize}
          start={start}
          total={total}
          totalPages={totalPages}
        />
      </Stack>
    );
  }

  // ── Desktop table (always compact density) ──────────────────────────────────
  const rowPy = 2;
  const cellPad = { paddingTop: rowPy, paddingBottom: rowPy };

  return (
    <Stack gap="xs">
      {toolbar}
      <ScrollArea>
        <Table
          highlightOnHover={!!onRowClick}
          stickyHeader={stickyHeader}
          striped
          verticalSpacing={rowPy}
        >
          <Table.Thead>
            <Table.Tr>
              {selectable && (
                <Table.Th className="w-10">
                  <Checkbox
                    aria-label="すべて選択"
                    checked={allOnPageSelected}
                    indeterminate={someOnPageSelected && !allOnPageSelected}
                    onChange={toggleAll}
                    size="xs"
                  />
                </Table.Th>
              )}
              {visibleColumns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <Table.Th
                    key={c.key}
                    onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                    style={{
                      width: c.width,
                      textAlign: c.align,
                      cursor: c.sortable ? "pointer" : undefined,
                    }}
                  >
                    <Group
                      gap={4}
                      justify={c.align === "right" ? "flex-end" : "flex-start"}
                      wrap="nowrap"
                    >
                      <Text c="dimmed" component="span" fw={600} size="xs">
                        {c.header}
                      </Text>
                      {c.sortable &&
                        (active ? (
                          sort?.dir === "asc" ? (
                            <IconChevronUp size={12} />
                          ) : (
                            <IconChevronDown size={12} />
                          )
                        ) : (
                          <IconArrowsSort className="opacity-40" size={12} />
                        ))}
                    </Group>
                  </Table.Th>
                );
              })}
              {rowActions && <Table.Th className="w-12" />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pageRows.map((row) => {
              const id = getRowId(row);
              const actions = rowActions?.(row) ?? [];
              return (
                <Table.Tr
                  bg={
                    selected.has(id) ? "var(--mantine-color-blue-0)" : undefined
                  }
                  className={onRowClick ? "cursor-pointer" : undefined}
                  key={id}
                >
                  {selectable && (
                    <Table.Td
                      onClick={(e) => e.stopPropagation()}
                      style={cellPad}
                    >
                      <Checkbox
                        aria-label="行を選択"
                        checked={selected.has(id)}
                        onChange={() => toggleOne(id)}
                        size="xs"
                      />
                    </Table.Td>
                  )}
                  {visibleColumns.map((c) => (
                    <Table.Td
                      key={c.key}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      style={{ textAlign: c.align, ...cellPad }}
                    >
                      {c.render(row)}
                    </Table.Td>
                  ))}
                  {rowActions && (
                    <Table.Td
                      onClick={(e) => e.stopPropagation()}
                      style={cellPad}
                    >
                      {actions.length > 0 && (
                        <Menu position="bottom-end" shadow="md" withinPortal>
                          <Menu.Target>
                            <ActionIcon
                              aria-label="操作"
                              color="gray"
                              variant="subtle"
                            >
                              <IconDotsVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            {actions.map((a) => (
                              <Menu.Item
                                color={a.color}
                                key={a.label}
                                leftSection={a.icon}
                                onClick={() => a.onAction?.(row)}
                              >
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
        count={pageRows.length}
        onPage={setPage}
        onPageSize={(v) => {
          setPageSize(v);
          setPage(1);
        }}
        page={safePage}
        pageSize={pageSize}
        start={start}
        total={total}
        totalPages={totalPages}
      />
    </Stack>
  );
}

// ── Pagination bar ────────────────────────────────────────────────────────────
function PaginationBar({
  total,
  start,
  count,
  page,
  totalPages,
  pageSize,
  onPage,
  onPageSize,
  isMobile,
}: {
  total: number;
  start: number;
  count: number;
  page: number;
  totalPages: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
  isMobile?: boolean;
}) {
  return (
    <Group justify="space-between" mt={4} wrap="nowrap">
      <Text c="dimmed" className="whitespace-nowrap" size="xs">
        {total === 0 ? "0件" : `${start + 1}–${start + count} / ${total}件`}
      </Text>
      <Group gap="xs" wrap="nowrap">
        {!isMobile && (
          <Select
            allowDeselect={false}
            aria-label="表示件数"
            data={PAGE_SIZES.map((s) => ({ value: s, label: `${s}件` }))}
            onChange={(v) => v && onPageSize(Number(v))}
            size="xs"
            value={String(pageSize)}
            w={92}
          />
        )}
        <Pagination
          onChange={onPage}
          siblings={isMobile ? 0 : 1}
          size="sm"
          total={totalPages}
          value={page}
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
    <Paper p="sm" radius="sm" withBorder>
      <Stack gap={4}>
        {first && (
          <Text fw={600} size="sm">
            {first.render(row)}
          </Text>
        )}
        <Group gap="md" wrap="wrap">
          {rest.slice(0, 4).map((c) => (
            <Group gap={4} key={c.key}>
              <Text c="dimmed" size="xs">
                {c.header}:
              </Text>
              <Text size="xs">{c.render(row)}</Text>
            </Group>
          ))}
        </Group>
      </Stack>
    </Paper>
  );
}
