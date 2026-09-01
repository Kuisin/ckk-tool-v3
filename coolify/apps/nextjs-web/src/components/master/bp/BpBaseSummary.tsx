"use client";

/**
 * BpBaseSummary.tsx — BP 詳細画面の法人基本情報グリッド（共通）。
 */

import { Anchor, Badge, Group } from "@mantine/core";
import { useLocale, useTranslations } from "next-intl";
import type { BpBaseDetail } from "@/app/(dashboard)/master/_shared/bp-data";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { SummaryGrid } from "@/components/ui/shells";
import { countryLabel } from "@/lib/enum-labels";
export function BpBaseSummary({
  record,
  extra,
}: {
  record: BpBaseDetail;
  extra?: React.ReactNode;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  return (
    <SummaryGrid>
      <FieldValue
        label={tr("common.bPCode")}
        value={<DocNumber>{record.bpCode}</DocNumber>}
      />
      <FieldValue
        label={tr("common.nameJapanese")}
        value={record.nameJa || "—"}
      />
      <FieldValue
        label={tr("common.nameEnglish")}
        value={record.nameEn || "—"}
      />
      <FieldValue label={tr("common.kana")} value={record.nameKana || "—"} />
      <FieldValue
        label={tr("common.shortName")}
        value={record.shortName || "—"}
      />
      <FieldValue
        label={tr("common.country")}
        value={
          record.countryCode
            ? (countryLabel(record.countryCode, locale) ?? record.countryCode)
            : "—"
        }
      />
      <FieldValue
        label={tr("common.address")}
        value={
          record.postalCode || record.addressJa
            ? `${record.postalCode ? `〒${record.postalCode} ` : ""}${record.addressJa}`
            : "—"
        }
      />
      <FieldValue
        label={tr("common.phoneNumber")}
        value={record.phone || "—"}
      />
      <FieldValue label="FAX" value={record.fax || "—"} />
      <FieldValue
        label={tr("common.emailAddress")}
        value={record.email || "—"}
      />
      <FieldValue
        label={tr("common.website")}
        value={
          record.website ? (
            <Anchor
              href={record.website}
              rel="noreferrer"
              size="sm"
              target="_blank"
            >
              {record.website}
            </Anchor>
          ) : (
            "—"
          )
        }
      />
      <FieldValue
        label={tr("master.bp.corporateNumber")}
        value={record.taxNumber || "—"}
      />
      <FieldValue
        label={tr("common.aIMatchNames")}
        value={
          record.matchNames.length > 0 ? (
            <Group gap={4} wrap="wrap">
              {record.matchNames.map((n) => (
                <Badge color="gray" key={n} size="sm" variant="light">
                  {n}
                </Badge>
              ))}
            </Group>
          ) : (
            "—"
          )
        }
      />
      {extra}
    </SummaryGrid>
  );
}
