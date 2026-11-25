"use client";

/**
 * IssuingCompanySelect — 拠点を持たない書類（見積書・価格試算・価格表）の
 * 作成フォームに置く「発行会社」欄。
 *
 * **所属拠点が 2 つ以上の自社法人にまたがる人にだけ出る**（`field.selectable`）。
 * 1 社にしか属さない人には選ぶものが無いので、欄ごと描かない — 値は
 * サーバーが同じ規則で決める（lib/doc-company-core.ts issuingCompanyChoice）。
 * 発行会社は作成後に変えられないので、編集フォームには置かない。
 */

import { Select } from "@mantine/core";
import { useTranslations } from "next-intl";
import type { IssuingCompanyField } from "@/lib/doc-company";

export function IssuingCompanySelect({
  field,
  value,
  onChange,
}: {
  /** 作成画面がサーバーで組み立てた材料。編集では渡さない。 */
  field?: IssuingCompanyField | null;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const tr = useTranslations();
  if (!field?.selectable) return null;
  return (
    <Select
      allowDeselect={false}
      data={field.options}
      description={tr("common.issuingCompanyDesc")}
      label={tr("common.issuingCompany")}
      onChange={(v) => onChange(v ? Number(v) : null)}
      value={value != null ? String(value) : null}
      withAsterisk
    />
  );
}
