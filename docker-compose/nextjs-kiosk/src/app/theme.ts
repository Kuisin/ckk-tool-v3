/**
 * theme.ts — Mantine テーマ（キオスク = タブレットファースト・ダーク固定）。
 *
 * nextjs-web のテーマ（_specs/design.md §2）をベースに、共有端末の
 * タッチ操作向けに既定サイズを lg に引き上げ（§20.1: 44px+ タッチターゲット）。
 * 配色は demo アプリのキオスク画面に倣った**ダークネイビー固定**
 * （providers.tsx で forceColorScheme="dark"）— ライト基調の nextjs-web と
 * ひと目で区別できるようにする。
 */

import { Badge, Button, createTheme, TextInput } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "blue",
  defaultRadius: "sm",
  fontFamily: "'Noto Sans JP', system-ui, -apple-system, sans-serif",
  colors: {
    // ネイビー寄りの dark パレット（demo キオスクの dark navy 基調）。
    // dark[7] = body 背景 / dark[6] = Paper 背景 / dark[0] = 明るいテキスト
    dark: [
      "#c9cce3",
      "#b0b4d0",
      "#8f94b5",
      "#6d7394",
      "#4a4f6d",
      "#3a3f5c",
      "#2b2f4a",
      "#21243b",
      "#191b2e",
      "#121322",
    ],
  },
  components: {
    Button: Button.extend({ defaultProps: { size: "lg" } }),
    TextInput: TextInput.extend({ defaultProps: { size: "lg" } }),
    Badge: Badge.extend({ defaultProps: { size: "md", radius: "sm" } }),
  },
});
