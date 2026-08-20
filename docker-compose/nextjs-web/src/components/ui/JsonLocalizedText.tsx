"use client";

/**
 * JsonLocalizedText.tsx — { ja, en } DB JSON field renderer
 * (_specs/design.md §10.6 / §17.4).
 *
 * 言語はユーザーの表示設定（app.users.locale）に従う。DB 側は ja/en の
 * 2 言語しか持たないので、中国語のユーザーには英語を出す（日本語より
 * 読める可能性が高い）— この読み替えは lib/format.ts の Formatters が持つ。
 */

import { useFormat } from "@/components/layout/PreferencesProvider";
import type { LocalizedText } from "@/lib/format";

export function JsonLocalizedText({
  value,
}: {
  value: LocalizedText | null | undefined;
}) {
  const fmt = useFormat();
  return <>{fmt.localized(value)}</>;
}
