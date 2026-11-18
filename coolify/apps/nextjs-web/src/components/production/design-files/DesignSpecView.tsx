"use client";

/**
 * DesignSpecView — 版の仕様の閲覧（版の詳細・製品マスタ MS24）。
 *
 * 閲覧モードは入力欄を並べない（_specs/design.md §10.10）。値の無い項目は
 * 出さず、何も無ければ「未設定」と 1 行で言う。
 *
 * 図面から読み取った値には印を付ける — 「図面」= 図面の値のまま、
 * 「手入力」= 人が上書きした値（図面の値を横に残す）。どの値が図面由来で、
 * どこが図面と違うのかを、編集を開かずに読めるように。
 */

import { Badge, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { FieldValue } from "@/components/ui/FieldValue";
import { useIsMobile } from "@/hooks/useViewport";
import {
  type DesignExtract,
  extractCounts,
  extractedValue,
  isLocked,
} from "@/lib/design-extract-core";
import { TITLE_BLOCK_FIELDS, type TitleBlock } from "@/lib/design-files-core";
import { specDisplayRows } from "@/lib/design-spec-core";
import type { ProductItemDef, ResolvedProductType } from "@/lib/product-types";

export interface DesignSpecViewData {
  materialTypeLabel: string | null;
  diameterMm: number | null;
  lengthMm: number | null;
  spec: Record<string, string>;
  titleBlock: TitleBlock;
  /** 図面から読み取った値（あれば印を付ける）。 */
  extract?: DesignExtract | null;
}

export function DesignSpecView({
  data,
  productTypes,
  itemDefs,
}: {
  data: DesignSpecViewData;
  productTypes: ResolvedProductType[];
  itemDefs: ProductItemDef[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const ex = data.extract ?? null;
  const titleFields = TITLE_BLOCK_FIELDS.filter((f) => data.titleBlock[f]);
  const specRows = specDisplayRows(data.spec, productTypes, itemDefs, tr);
  const typeName = productTypes.find((t) => t.id === data.spec._product_type)
    ?.name.ja;
  const hasMaterial =
    data.materialTypeLabel != null ||
    data.diameterMm != null ||
    data.lengthMm != null;

  /** 値 + 出どころの印（値の後ろに同じ行で並べる）。 */
  const withMark = (
    key: string,
    value: ReactNode,
    display?: (v: string) => string,
  ): ReactNode => {
    const raw = extractedValue(ex, key);
    if (raw == null) return value;
    if (isLocked(ex, key)) {
      return (
        <>
          {value}{" "}
          <Badge color="blue" component="span" size="xs" variant="light">
            {tr("production.designVersion.extract.fromDrawing")}
          </Badge>
        </>
      );
    }
    return (
      <>
        {value}{" "}
        <Badge color="orange" component="span" size="xs" variant="light">
          {tr("production.designVersion.extract.manual")}
        </Badge>{" "}
        <Text c="dimmed" component="span" size="xs">
          {tr("production.designVersion.extract.drawingValue", {
            value: display ? display(raw) : raw,
          })}
        </Text>
      </>
    );
  };

  if (
    titleFields.length === 0 &&
    specRows.length === 0 &&
    !hasMaterial &&
    !typeName
  ) {
    return (
      <Text c="dimmed" size="sm">
        {tr("production.designVersion.noSpec")}
      </Text>
    );
  }

  const counts = extractCounts(ex);

  return (
    <Stack gap="md">
      {ex && (
        <Text c="dimmed" size="xs">
          {tr("production.designVersion.extract.viewSummary", {
            file: ex.source.fileName ?? ex.source.sheetNumber ?? "—",
            read: counts.read,
            overridden: counts.overridden,
            at: fmt.dateTime(ex.source.readAt),
          })}
        </Text>
      )}
      {titleFields.length > 0 && (
        <Stack gap="xs">
          <Title order={6}>{tr("production.designVersion.titleBlock")}</Title>
          <SimpleGrid cols={isMobile ? 1 : 3} spacing="sm">
            {titleFields.map((f) => (
              <FieldValue
                key={f}
                label={tr(`production.designVersion.titleBlockField.${f}`)}
                value={withMark(`titleBlock.${f}`, data.titleBlock[f])}
              />
            ))}
          </SimpleGrid>
        </Stack>
      )}
      {hasMaterial && (
        <Stack gap="xs">
          <Title order={6}>{tr("common.materialSpecification")}</Title>
          <SimpleGrid cols={isMobile ? 1 : 3} spacing="sm">
            <FieldValue
              label={tr("common.materialTypes")}
              value={data.materialTypeLabel ?? "—"}
            />
            <FieldValue
              label={tr("common.diameterMm")}
              value={withMark(
                "diameterMm",
                data.diameterMm != null ? `φ${data.diameterMm}` : "—",
                (v) => `φ${v}`,
              )}
            />
            <FieldValue
              label={tr("common.overallLengthMm")}
              value={withMark(
                "lengthMm",
                data.lengthMm != null ? String(data.lengthMm) : "—",
              )}
            />
          </SimpleGrid>
        </Stack>
      )}
      {(typeName || specRows.length > 0) && (
        <Stack gap="xs">
          <Title order={6}>{tr("common.productItems")}</Title>
          <SimpleGrid cols={isMobile ? 1 : 3} spacing="sm">
            {typeName && (
              <FieldValue label={tr("common.productTypes")} value={typeName} />
            )}
            {specRows.map((r) => (
              <FieldValue
                key={r.key}
                label={r.label}
                value={withMark(`spec.${r.key}`, r.value)}
              />
            ))}
          </SimpleGrid>
        </Stack>
      )}
    </Stack>
  );
}
