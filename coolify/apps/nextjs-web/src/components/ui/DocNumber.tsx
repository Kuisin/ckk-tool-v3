/**
 * DocNumber.tsx — 書類番号（QOT-/ORD-/DRN-/INV-…）。
 * 等幅 + 桁揃え（_specs/design.md §1.2）。
 *
 * **接頭辞は薄く、番号を主役に。** 一覧に `ORD-202609-00042` が縦に並ぶと、
 * どの行も左端の 4 文字が同じなので、目が最初に当たる場所に情報が無い。
 * 実際に見分けたいのは後ろの番号のほう。
 *
 * ★ 色ではなく**薄さ**を変える。番号にはリンクを示す青が付くことがあり
 *   （`c="blue"`）、そこを灰色に塗ると青が消えて「押せる」ことが伝わらない。
 *   薄くするだけなら色は保たれる。
 *
 * ★ 接頭辞を持たない番号（ロット番号など）もここに来るので、そのときは
 *   何も薄くしない（数字の頭が薄いと読み違える）。
 */

import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { splitDocNumber } from "@/lib/doc-number";

export function DocNumber({
  children,
  c,
}: {
  children: ReactNode;
  c?: string;
}) {
  // 文字列以外（要素・null）はそのまま出す。切り分けようがない。
  if (typeof children !== "string") {
    return (
      <Text c={c} className="tabular-nums" ff="mono" size="sm">
        {children}
      </Text>
    );
  }

  const { prefix, rest } = splitDocNumber(children);
  return (
    <Text c={c} className="tabular-nums" ff="mono" size="sm">
      {prefix && <span style={{ opacity: 0.55 }}>{prefix}</span>}
      {rest}
    </Text>
  );
}
