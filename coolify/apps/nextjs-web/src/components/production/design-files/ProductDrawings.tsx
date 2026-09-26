"use client";

/**
 * ProductDrawings — ある製品の設計図 (PD26)。系列ごとに版を並べる。
 *
 * 系列（製品 × 受注元）ごとに節を分ける。汎用が先頭で、以降は版数の多い順
 * （lib/design-files-core.ts groupVersionsBySeries — 製品マスタ・一覧と同じ並び）。
 * 系列を混ぜて 1 本の表にすると「どの顧客の v3 なのか」が読めなくなる。
 *
 * 受注元のドロップダウンで、1 つの系列だけに絞れる（URL の ?series= —
 * 一覧の行から来たときはその系列で開く。値の形は design-files-core seriesParam）。
 * 絞っているあいだの「版を登録」は、その受注元を選んだ状態で登録画面を開く。
 *
 * 1 行 = 1 版。状態（下書き / 承認依頼中 / 確定 / 差し戻し）・仕様の要約・
 * 載っているファイルを出し、押すと版の詳細へ行く。直す・確定するのは版の
 * 詳細で行う（ここは探す画面）。
 */

import {
  Badge,
  Box,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronRight, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { SecondaryButton } from "@/components/ui/buttons";
import { DesignFileThumb } from "@/components/ui/DesignFileViewer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DetailShell } from "@/components/ui/shells";
import { useUrlSelectState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  GENERIC_SERIES_PARAM,
  groupVersionsBySeries,
  matchesSeriesParam,
  pickThumbFile,
  seriesParam,
} from "@/lib/design-files-core";
import type { DesignVersionView } from "./model";
import { RoleBadge } from "./RoleBadge";

const BASE_PATH = "/production/design-files";

export function ProductDrawings({
  itemId,
  productLabel,
  versions,
  canManage,
}: {
  /** 対象製品の品目 id（items.id）。 */
  itemId: number;
  productLabel: string;
  versions: DesignVersionView[];
  /** 版を作れる権限があるか。 */
  canManage: boolean;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  const allSeries = groupVersionsBySeries(versions);
  const [seriesFilter, setSeriesFilter] = useUrlSelectState("series");

  const seriesLabel = (g: (typeof allSeries)[number]) =>
    g.customerBpId == null
      ? tr("common.generic")
      : (g.versions.find((v) => v.customerName)?.customerName ??
        tr("common.orderingCustomer"));
  const seriesOptions = allSeries.map((g) => ({
    value: seriesParam(g.customerBpId),
    label: tr("production.designVersion.seriesOption", {
      name: seriesLabel(g),
      count: g.versions.length,
    }),
  }));
  // URL の値が今ある系列を指していなければ（古いリンク・消えた系列）全部を出す。
  const activeFilter = seriesOptions.some((o) => o.value === seriesFilter)
    ? seriesFilter
    : null;
  const series = allSeries.filter((g) =>
    matchesSeriesParam(g.customerBpId, activeFilter),
  );
  // 受注元で絞っているときは、その受注元を選んだ状態で登録画面を開く。
  const newHref =
    activeFilter && activeFilter !== GENERIC_SERIES_PARAM
      ? `${BASE_PATH}/new?item=${itemId}&customer=${encodeURIComponent(activeFilter)}`
      : `${BASE_PATH}/new?item=${itemId}`;

  return (
    <DetailShell
      actions={
        canManage ? (
          <SecondaryButton href={newHref} leftSection={<IconPlus size={14} />}>
            {tr("production.designFiles.registerAVersion")}
          </SecondaryButton>
        ) : undefined
      }
      breadcrumbs={[
        tr("common.production"),
        { label: tr("common.drawing"), href: BASE_PATH },
        productLabel,
      ]}
      title={productLabel}
    >
      <Stack gap="lg">
        {allSeries.length > 1 && (
          <Select
            aria-label={tr("common.orderingCustomer")}
            clearable
            data={seriesOptions}
            label={tr("common.orderingCustomer")}
            maw={isMobile ? undefined : 360}
            onChange={setSeriesFilter}
            placeholder={tr("production.designVersion.allSeries")}
            searchable={seriesOptions.length > 5}
            value={activeFilter}
          />
        )}
        {series.length === 0 ? (
          <Text c="dimmed" size="sm">
            {tr("common.thereIsNoDrawingForThis")}
          </Text>
        ) : (
          series.map((g) => {
            const latestConfirmed = g.versions.find((v) => v.isLatestConfirmed);
            const thumb = latestConfirmed
              ? pickThumbFile(latestConfirmed.files)
              : null;
            return (
              <Stack
                gap="xs"
                // 一覧の行から系列へ直接来られるようにアンカーを置く。
                id={`series-${g.customerBpId ?? "generic"}`}
                key={g.customerBpId ?? "__generic__"}
              >
                <Group gap="xs" wrap="wrap">
                  <Badge
                    color={g.customerBpId == null ? "gray" : "blue"}
                    variant="light"
                  >
                    {seriesLabel(g)}
                  </Badge>
                  <Text c="dimmed" size="xs">
                    {latestConfirmed
                      ? tr("production.designVersion.latestConfirmedVersion", {
                          version: latestConfirmed.version,
                        })
                      : tr("production.designVersion.noConfirmedVersion")}
                  </Text>
                </Group>
                {thumb && latestConfirmed && (
                  <Box maw={320}>
                    <DesignFileThumb
                      target={{
                        caption: tr(
                          "production.productDrawings.versionLatest",
                          {
                            version: latestConfirmed.version,
                          },
                        ),
                        filename: thumb.filename,
                        mimeType: thumb.mimeType,
                        src: `/api/design-files/${encodeURIComponent(thumb.id)}`,
                      }}
                    />
                  </Box>
                )}
                <Stack gap={6}>
                  {g.versions.map((v) => (
                    <UnstyledButton
                      aria-label={tr("production.designVersion.openVersion", {
                        version: v.version,
                      })}
                      key={v.id}
                      onClick={() =>
                        router.push(`${BASE_PATH}/versions/${v.id}`)
                      }
                    >
                      <Paper p="sm" radius="sm" withBorder>
                        <Group gap="sm" justify="space-between" wrap="nowrap">
                          <Stack className="min-w-0" gap={4}>
                            <Group gap="xs" wrap="wrap">
                              <Text className="tabular-nums" fw={600} size="sm">
                                v{v.version}
                              </Text>
                              <StatusBadge
                                entity="DesignVersion"
                                status={v.status}
                              />
                              {v.isLatestConfirmed && <RoleBadge latest />}
                              {v.files.map((f) => (
                                <RoleBadge key={f.id} role={f.role} />
                              ))}
                            </Group>
                            <Text c="dimmed" size="xs" truncate>
                              {[
                                v.titleBlock.productName,
                                v.materialTypeLabel,
                                v.diameterMm != null && v.lengthMm != null
                                  ? `φ${v.diameterMm}×${v.lengthMm}`
                                  : null,
                                v.notes,
                              ]
                                .filter(Boolean)
                                .join(" / ") || "—"}
                            </Text>
                          </Stack>
                          <Group className="shrink-0" gap="xs" wrap="nowrap">
                            <Text c="dimmed" className="tabular-nums" size="xs">
                              {fmt.date(v.confirmedAt ?? v.createdAt)}
                            </Text>
                            <IconChevronRight size={16} />
                          </Group>
                        </Group>
                      </Paper>
                    </UnstyledButton>
                  ))}
                </Stack>
              </Stack>
            );
          })
        )}
      </Stack>
    </DetailShell>
  );
}
