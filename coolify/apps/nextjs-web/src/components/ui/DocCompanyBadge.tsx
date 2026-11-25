"use client";

/**
 * DocCompanyBadge — 書類の発行会社（自社法人）のコードを小さなバッジで出す。
 *
 * 書類番号は法人ごとの連番なので、CKK と TSP に同じ `QOT-2026-00001` があり得る。
 * 番号の隣（一覧のセル・スマホのカード）と詳細の見出し（DetailShell の
 * `company`）にこれを置く。**出すかどうかはこの部品が決める**
 * （lib/doc-company-view-core.ts showsDocCompany — 1 社だけの人の画面には出ない）
 * ので、呼び出し側は無条件に置いてよい。
 *
 * 法人名はツールチップ。`data-doc-company` は通し確認（scenarios）の目印。
 */

import { Badge, Group, Tooltip } from "@mantine/core";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useDocCompanyViewer } from "@/components/layout/DocCompanyProvider";
import { docCompanyCode, showsDocCompany } from "@/lib/doc-company-view-core";

/** 法人コードそのもの（`CKK`）が渡されたとき。番号（`QOT-…`）は法人ではない。 */
function bareCode(value: string | null | undefined): string | null {
  return value && /^[A-Z0-9]{1,10}$/.test(value) ? value : null;
}

/**
 * 法人コードのバッジ。`company` は法人コード、`docId` は書類の id / 参照
 * （`CKK~QOT-…`）（法人コードそのものも可）— どちらか一方を渡す。出さない人・分からない書類では null。
 */
export function DocCompanyBadge({
  company,
  docId,
  size = "xs",
}: {
  company?: string | null;
  docId?: string | null;
  size?: "xs" | "sm";
}) {
  const tr = useTranslations();
  const viewer = useDocCompanyViewer();
  const code = company ?? docCompanyCode(docId) ?? bareCode(docId);
  if (!viewer || !code || !showsDocCompany(viewer, code)) return null;
  const name = viewer.names[code] ?? code;
  return (
    <Tooltip label={`${tr("common.issuingCompany")}: ${name}`} withinPortal>
      <Badge
        color="gray"
        data-doc-company={code}
        ff="mono"
        radius="sm"
        size={size}
        style={{ flexShrink: 0 }}
        variant="outline"
      >
        {code}
      </Badge>
    </Tooltip>
  );
}

/** 番号などの中身の右にバッジを添える（バッジが無ければ中身だけ）。 */
export function WithDocCompany({
  children,
  company,
  docId,
}: {
  children: ReactNode;
  company?: string | null;
  docId?: string | null;
}) {
  return (
    <Group component="span" gap={6} wrap="nowrap">
      {children}
      <DocCompanyBadge company={company} docId={docId} />
    </Group>
  );
}
