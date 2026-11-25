"use client";

import { Anchor, type AnchorProps } from "@mantine/core";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * アプリ内リンクの見た目をした Next の Link（`<Anchor component={Link}>`）。
 *
 * **Server Component からはこれを使う。** Server Component が
 * `<Anchor component={Link}>` と書くと、`component` に関数を載せてクライアントへ
 * 渡すことになり、描画時に落ちる（"Functions cannot be passed directly to Client
 * Components" — 法人を選ぶ画面 /doc/choose が実際に 500 になっていた）。
 * クライアント側で組み立てれば、サーバーから渡るのは文字列だけになる。
 */
export function LinkAnchor({
  href,
  children,
  ...props
}: AnchorProps & { href: string; children: ReactNode }) {
  return (
    <Anchor component={Link} href={href} {...props}>
      {children}
    </Anchor>
  );
}
