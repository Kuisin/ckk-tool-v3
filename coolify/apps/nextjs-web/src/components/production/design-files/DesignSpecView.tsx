"use client";

/**
 * DesignSpecView — 版の仕様の閲覧（版の詳細・製品マスタ MS24）。
 *
 * 閲覧モードは入力欄を並べない（_specs/design.md §10.10）。値の無い項目は
 * 出さず、何も無ければ「未設定」と 1 行で言う。
 */

import { SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useTranslations } from "next-intl";
import { FieldValue } from "@/components/ui/FieldValue";
import { useIsMobile } from "@/hooks/useViewport";
import { TITLE_BLOCK_FIELDS, type TitleBlock } from "@/lib/design-files-core";
import { specDisplayRows } from "@/lib/design-spec-core";
import type { ProductItemDef, ResolvedProductType } from "@/lib/product-types";

export interface DesignSpecViewData {
  materialTypeLabel: string | null;
  diameterMm: number | null;
  lengthMm: number | null;
  spec: Record<string, string>;
  titleBlock: TitleBlock;
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
  const isMobile = useIsMobile();
  const titleFields = TITLE_BLOCK_FIELDS.filter((f) => data.titleBlock[f]);
  const specRows = specDisplayRows(data.spec, productTypes, itemDefs, tr);
  const typeName = productTypes.find((t) => t.id === data.spec._product_type)
    ?.name.ja;
  const hasMaterial =
    data.materialTypeLabel != null ||
    data.diameterMm != null ||
    data.lengthMm != null;

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

  return (
    <Stack gap="md">
      {titleFields.length > 0 && (
        <Stack gap="xs">
          <Title order={6}>{tr("production.designVersion.titleBlock")}</Title>
          <SimpleGrid cols={isMobile ? 1 : 3} spacing="sm">
            {titleFields.map((f) => (
              <FieldValue
                key={f}
                label={tr(`production.designVersion.titleBlockField.${f}`)}
                value={data.titleBlock[f]}
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
              value={data.diameterMm != null ? `φ${data.diameterMm}` : "—"}
            />
            <FieldValue
              label={tr("common.overallLengthMm")}
              value={data.lengthMm != null ? String(data.lengthMm) : "—"}
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
              <FieldValue key={r.key} label={r.label} value={r.value} />
            ))}
          </SimpleGrid>
        </Stack>
      )}
    </Stack>
  );
}
