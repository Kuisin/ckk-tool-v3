"use client";

/**
 * DesignFileTable — 設計図 一覧 (PD06, design.md §8.1 / §14).
 *
 * **1 行 = 1 系列（製品 × 受注元）**、版ではない。探しているのは
 * 「この製品の、この客先向けの図面」であって「v2 という行」ではないので、
 * 版を 1 行ずつ並べると同じ製品が何行も出て目的の系列が埋もれる。
 * 版の並びは系列を開いた先 (PD26) で見る。
 *
 * 列: 製品 / 受注元 / 最新版 / 役割 / 出どころ / 更新日。
 * フィルタ: 検索（製品・受注元）+ 受注元の別（汎用 / 顧客別）+ 出どころ。
 * 行クリック → その製品の設計図（系列ごとの節）。
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconRuler2, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { DESIGN_FILE_ROLE_COLOR, type DesignFileSeriesRow } from "./model";

const BASE_PATH = "/production/design-files";

export function DesignFileTable({
  rows,
  truncated,
}: {
  rows: DesignFileSeriesRow[];
  /** 取得上限に当たったか。当たったことは黙らせない（§「no silent caps」）。 */
  truncated: boolean;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  /** 系列の別 — 汎用（受注元なし）か、特定の顧客向けか。 */
  const SERIES_OPTIONS = [
    { value: "generic", label: tr("common.generic") },
    { value: "customer", label: tr("production.designFileTable.byCustomer") },
  ];

  const SOURCE_OPTIONS = [
    {
      value: "request",
      label: tr("production.designFileTable.hasARequest"),
    },
    {
      value: "manual",
      label: tr("production.designFileTable.manualOnly"),
    },
  ];

  const [search, setSearch] = useUrlStringState("q");
  const [series, setSeries] = useUrlSelectState("series");
  const [source, setSource] = useUrlSelectState("source");

  const reset = () => {
    setSearch(null);
    setSeries(null);
    setSource(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.productName.includes(search) ||
      (r.productCode ?? "").includes(search) ||
      (r.customerName ?? "").includes(search);
    const matchesSeries =
      !series ||
      (series === "generic" ? r.customerBpId == null : r.customerBpId != null);
    const matchesSource =
      !source ||
      (source === "request" ? r.hasRequestSourced : !r.hasRequestSourced);
    return matchesSearch && matchesSeries && matchesSource;
  });

  const columns: Column<DesignFileSeriesRow>[] = [
    {
      key: "productName",
      header: tr("common.product"),
      sortable: true,
      // 名称とコードを 2 行に分ける。1 行に詰めると長い製品名でコードが
      // 切れてしまい、台帳として引けなくなる（コードは mono・design.md §14）。
      render: (r) => (
        <Stack gap={0}>
          <Text size="sm">{r.productName}</Text>
          {r.productCode && (
            <Text c="dimmed" ff="mono" size="xs">
              {r.productCode}
            </Text>
          )}
        </Stack>
      ),
    },
    {
      key: "customerName",
      header: tr("common.orderingCustomer"),
      sortable: true,
      sortValue: (r) => r.customerName ?? "",
      render: (r) =>
        r.customerBpId == null ? (
          <Badge color="gray" variant="light">
            {tr("common.generic")}
          </Badge>
        ) : (
          <Badge color="blue" variant="light">
            {r.customerName ?? tr("common.orderingCustomer")}
          </Badge>
        ),
    },
    {
      key: "latestVersion",
      header: tr("production.designFiles.latestVersion"),
      width: 110,
      sortable: true,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          v{r.latestVersion}
          {r.versionCount > 1 && (
            <Text c="dimmed" component="span" size="xs">
              {" "}
              （全 {r.versionCount} 版）
            </Text>
          )}
        </Text>
      ),
    },
    {
      key: "latestRoles",
      header: tr("common.role2"),
      // 最新版に何が揃っているか。図面データが無い系列は作れないはずだが、
      // 手で入れたデータや将来の変更で欠けうるので、揃っているものを出す。
      render: (r) => (
        <Group gap={4}>
          {r.latestRoles.map((role) => (
            <Badge
              color={DESIGN_FILE_ROLE_COLOR[role] ?? "gray"}
              key={role}
              variant="light"
            >
              {tr(`enum.DESIGN_FILE_ROLE_LABEL.${role}`)}
            </Badge>
          ))}
        </Group>
      ),
    },
    {
      key: "hasRequestSourced",
      header: tr("production.designFiles.source"),
      width: 100,
      sortValue: (r) => (r.hasRequestSourced ? 1 : 0),
      render: (r) => (
        <Badge color={r.hasRequestSourced ? "blue" : "gray"} variant="light">
          {r.hasRequestSourced ? "依頼" : tr("common.manual")}
        </Badge>
      ),
    },
    {
      key: "updatedAt",
      header: tr("common.updated"),
      width: 120,
      sortable: true,
      sortValue: (r) => r.updatedAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {fmt.date(r.updatedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={
        <NewButton
          href={`${BASE_PATH}/new`}
          label={tr("common.registerADrawing")}
        />
      }
      breadcrumbs={[tr("common.production"), tr("common.drawing")]}
      filters={
        <>
          <Select
            clearable
            data={SERIES_OPTIONS}
            flex={isMobile ? 1 : undefined}
            onChange={setSeries}
            placeholder={tr("common.orderingCustomer")}
            value={series}
            w={isMobile ? undefined : 120}
          />
          <Select
            clearable
            data={SOURCE_OPTIONS}
            flex={isMobile ? 1 : undefined}
            onChange={setSource}
            placeholder={tr("production.designFiles.source")}
            value={source}
            w={isMobile ? undefined : 130}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr(
            "production.designFiles.searchByProductOrOrderingCustomer",
          )}
          value={search}
        />
      }
      title={tr("common.drawing")}
    >
      {truncated && (
        <Text c="orange" mb="xs" size="xs">
          {tr("production.designFiles.thereAreTooManyVersionsSo")}
        </Text>
      )}
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "updatedAt", dir: "desc" }}
        emptyAction={
          <NewButton
            href={`${BASE_PATH}/new`}
            label={tr("common.registerADrawing")}
          />
        }
        emptyIcon={<IconRuler2 size={24} />}
        emptyMessage={tr("production.designFiles.thereAreNoDrawings")}
        getRowId={(r) => r.key}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.productId}`)}
      />
    </ListShell>
  );
}
