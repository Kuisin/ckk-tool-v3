import { type LocalizedText, localized } from "@/lib/format";

/**
 * 研ぎ直す工具（再研磨）のラベル: メーカー名（他社製品のみ）+ 名称 + 品目コード。
 * 誰が作った工具なのかは預かるときに最初に要る情報なので先頭に置く。
 *
 * 注文請書・注文明細・見積書が同じ形で出す（以前は data.ts ごとに複写していた）。
 */
export function toolLabel(t: {
  name: unknown;
  code: string | null;
  isExternalProduct: boolean;
  makerName: string | null;
}): string {
  const maker = t.isExternalProduct ? t.makerName?.trim() : null;
  return [maker, localized(t.name as LocalizedText | null), t.code]
    .filter((x): x is string => !!x)
    .join(" ");
}

/** `toolLabel` に要る列（prisma の select にそのまま渡す）。 */
export const TOOL_LABEL_SELECT = {
  name: true,
  code: true,
  isExternalProduct: true,
  makerName: true,
} as const;
