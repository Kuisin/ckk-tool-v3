/**
 * theme.ts — Mantine テーマ（キオスク = タブレットファースト）。
 *
 * nextjs-web のテーマ（_specs/design.md §2）をベースに、共有端末の
 * タッチ操作向けに既定サイズを lg に引き上げ（§20.1: 44px+ タッチターゲット）。
 */

import { Badge, Button, createTheme, TextInput } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "blue",
  defaultRadius: "sm",
  fontFamily: "'Noto Sans JP', system-ui, -apple-system, sans-serif",
  components: {
    Button: Button.extend({ defaultProps: { size: "lg" } }),
    TextInput: TextInput.extend({ defaultProps: { size: "lg" } }),
    Badge: Badge.extend({ defaultProps: { size: "md", radius: "sm" } }),
  },
});
