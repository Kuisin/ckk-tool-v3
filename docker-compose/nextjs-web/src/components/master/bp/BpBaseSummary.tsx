"use client";

/**
 * BpBaseSummary.tsx — BP 詳細画面の法人基本情報グリッド（共通）。
 */

import { Anchor } from "@mantine/core";
import type { BpBaseDetail } from "@/app/(dashboard)/master/_shared/bp-data";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { SummaryGrid } from "@/components/ui/shells";
import { COUNTRY_LABEL } from "@/lib/enum-labels";

export function BpBaseSummary({
  record,
  extra,
}: {
  record: BpBaseDetail;
  extra?: React.ReactNode;
}) {
  return (
    <SummaryGrid>
      <FieldValue
        label="BPコード"
        value={<DocNumber>{record.bpCode}</DocNumber>}
      />
      <FieldValue label="名称（日本語）" value={record.nameJa || "—"} />
      <FieldValue label="名称（英語）" value={record.nameEn || "—"} />
      <FieldValue label="フリガナ" value={record.nameKana || "—"} />
      <FieldValue label="略称" value={record.shortName || "—"} />
      <FieldValue
        label="国"
        value={
          record.countryCode
            ? (COUNTRY_LABEL[record.countryCode] ?? record.countryCode)
            : "—"
        }
      />
      <FieldValue
        label="住所"
        value={
          record.postalCode || record.addressJa
            ? `${record.postalCode ? `〒${record.postalCode} ` : ""}${record.addressJa}`
            : "—"
        }
      />
      <FieldValue label="電話番号" value={record.phone || "—"} />
      <FieldValue label="FAX" value={record.fax || "—"} />
      <FieldValue label="メールアドレス" value={record.email || "—"} />
      <FieldValue
        label="Webサイト"
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
      <FieldValue label="法人番号" value={record.taxNumber || "—"} />
      {extra}
    </SummaryGrid>
  );
}
