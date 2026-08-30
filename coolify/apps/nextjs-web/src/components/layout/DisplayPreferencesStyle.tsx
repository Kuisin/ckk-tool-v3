/**
 * DisplayPreferencesStyle — 文字の大きさ・太さを :root へ流し込む `<style>`。
 *
 * サーバーコンポーネント。ダッシュボードのレイアウトが 1 枚だけ描く。
 * クライアントで当てると最初の描画が既定の大きさになり、直後に切り替わって
 * 画面がひと呼吸おいて跳ねるので、SSR の時点で載せる。
 *
 * 変数を読むのは globals.css §2（html の font-size / body の font-weight /
 * Mantine の太さ変数）— 適用の仕方はそちらの 1 か所だけが持つ。
 * `:root` に当てるので、body 直下へ portal されるモーダル・ポップオーバーにも
 * そのまま効く。
 */

import {
  type DisplayPreferences,
  displayRootCss,
} from "@/lib/user-preferences-core";

export function DisplayPreferencesStyle({
  prefs,
}: {
  prefs: DisplayPreferences;
}) {
  return <style>{displayRootCss(prefs)}</style>;
}
