"use client";

/**
 * MovementTable — 入出庫伝票 一覧 (PD07, design.md §8.1 / §14)。
 *
 * Columns: 伝票番号（mono, 詳細リンク）/ 日時 / 事由（バッジ）/ 拠点 / 明細数 /
 * 元書類（sourceType + sourceId をテキストで）。
 * フィルタ: 伝票番号での検索 + 事由 + 拠点。作る画面は無い（読み取り専用）。
 */

import { Alert, Badge, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconArrowsExchange, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { movementCauseLabel, movementCauseOptions } from "@/lib/enum-labels";
import type { Locale } from "@/lib/i18n";
import { MOVEMENT_CAUSE_COLOR, type MovementRow } from "./model";

const BASE_PATH = "/production/inventory/movements";

export function MovementTable({
  rows,
  plantOptions,
  truncated = false,
}: {
  rows: MovementRow[];
  plantOptions: { value: string; label: string }[];
  /** 取得上限で切れている（= まだ古い伝票がある）。 */
  truncated?: boolean;
}) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [cause, setCause] = useUrlSelectState("cause");
  const [plantId, setPlantId] = useUrlSelectState("plant");

  const reset = () => {
    setSearch(null);
    setCause(null);
    setPlantId(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.movementNumber.includes(search) ||
      (r.sourceId ?? "").includes(search);
    const matchesCause = !cause || r.cause === cause;
    const matchesPlant = !plantId || String(r.plantId) === plantId;
    return matchesSearch && matchesCause && matchesPlant;
  });

  const columns: Column<MovementRow>[] = [
    {
      key: "movementNumber",
      header: tr("production.movements.movementNumber"),
      sortable: true,
      sortValue: (r) => r.movementNumber,
      render: (r) => <DocNumber c="blue">{r.movementNumber}</DocNumber>,
    },
    {
      key: "createdAt",
      header: tr("common.dateAndTime"),
      width: 160,
      sortable: true,
      sortValue: (r) => r.createdAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {fmt.dateTime(r.createdAt)}
        </Text>
      ),
    },
    {
      key: "cause",
      header: tr("production.movements.cause"),
      width: 150,
      sortable: true,
      sortValue: (r) => movementCauseLabel(r.cause, locale),
      render: (r) => (
        <Badge color={MOVEMENT_CAUSE_COLOR[r.cause] ?? "gray"} variant="light">
          {movementCauseLabel(r.cause, locale)}
        </Badge>
      ),
    },
    {
      key: "plantName",
      header: tr("common.site"),
      sortValue: (r) => r.plantName ?? "",
      render: (r) => r.plantName ?? "—",
    },
    {
      key: "lineCount",
      header: tr("common.lineCount"),
      align: "right",
      width: 90,
      sortValue: (r) => r.lineCount,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.lineCount}
        </Text>
      ),
    },
    {
      key: "source",
      header: tr("production.movements.sourceDocument"),
      hideable: true,
      sortValue: (r) => r.sourceId ?? "",
      render: (r) =>
        r.sourceId ? (
          <>
            <Text size="sm">{r.sourceId}</Text>
            <Text c="dimmed" size="xs">
              {r.sourceType}
            </Text>
          </>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <ListShell
      breadcrumbs={[tr("common.production"), tr("common.stockMovement")]}
      filters={
        <>
          <Select
            aria-label={tr("production.movements.cause")}
            clearable
            data={movementCauseOptions(locale)}
            flex={isMobile ? 1 : undefined}
            onChange={setCause}
            placeholder={tr("production.movements.cause")}
            value={cause}
            w={isMobile ? undefined : 170}
          />
          <Select
            aria-label={tr("common.site")}
            clearable
            data={plantOptions}
            flex={isMobile ? 1 : undefined}
            onChange={setPlantId}
            placeholder={tr("common.selectASite")}
            searchable
            value={plantId}
            w={isMobile ? undefined : 180}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          aria-label={tr("production.movements.searchByNumber")}
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("production.movements.searchByNumber")}
          value={search}
        />
      }
      title={tr("common.stockMovement")}
    >
      {truncated ? (
        <Alert color="orange" mb="sm" variant="light">
          {tr("production.movements.truncatedNotice")}
        </Alert>
      ) : null}
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "createdAt", dir: "desc" }}
        emptyIcon={<IconArrowsExchange size={24} />}
        emptyMessage={tr("production.movements.noMovements")}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Stack className="min-w-0" gap={3}>
            <Text c="dimmed" ff="mono" size="xs">
              {r.movementNumber}
            </Text>
            <Text fw={600} size="sm">
              {fmt.dateTime(r.createdAt)}
            </Text>
            <Badge
              color={MOVEMENT_CAUSE_COLOR[r.cause] ?? "gray"}
              variant="light"
            >
              {movementCauseLabel(r.cause, locale)}
            </Badge>
            <Text c="dimmed" size="xs">
              {r.plantName ?? "—"}
              {" / "}
              {tr("common.lineCount")}: {r.lineCount}
            </Text>
          </Stack>
        )}
        urlState
      />
    </ListShell>
  );
}
