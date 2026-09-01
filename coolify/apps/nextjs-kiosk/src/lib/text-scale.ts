/**
 * text-scale.ts — 文字の大きさ（共有端末）。
 *
 * 段と倍率は **nextjs-web と同じもの**。保存先も同じ `app.users.text_scale` で、
 * ログインした人の設定が Web からタブレットへ、タブレットから Web へそのまま
 * ついてくる（同じ人が同じ大きさで読めるのが目的で、端末ごとに持たせると
 * 「会社の PC では直したのにタブレットでは戻っている」になる）。
 *
 * ★ web の `lib/user-preferences-core.ts` には日付・時刻・タイムゾーンなども
 *   入っていて、こちらに要るのは大きさだけなので丸ごとの複製はしない。
 *   代わりに **倍率が食い違っていないかを試験で見張る**（text-scale.test.ts）。
 *   同じ人が Web と端末で違う大きさになるのは、いちばん気づきにくい壊れ方。
 */

/** 5 段。真ん中（md）が従来の大きさ。 */
export const TEXT_SCALES = ["xs", "sm", "md", "lg", "xl"] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

/**
 * 段ごとの倍率（html の font-size に掛ける）。rem 基準を動かすので、文字だけで
 * なく余白・行の高さ・部品の高さも一緒に伸び縮みする。
 *
 * 下げ幅より上げ幅を大きく取ってあるのは web と同じ理由 — 小さくしたい人は
 * 「少し詰めたい」だけだが、大きくしたい人は「読めない」を直したい。
 */
export const TEXT_SCALE_FACTORS: Record<TextScale, number> = {
  xs: 0.875,
  sm: 0.9375,
  md: 1,
  lg: 1.125,
  xl: 1.25,
};

/** 画面に出す段の名前（i18n-glossary §3.17）。 */
export const TEXT_SCALE_LABELS: Record<TextScale, string> = {
  xs: "最小",
  sm: "小",
  md: "標準",
  lg: "大",
  xl: "最大",
};

export const DEFAULT_TEXT_SCALE: TextScale = "md";

/** 不明な値は既定へ倒す（DB に古い値・手書きの値が入っていても壊さない）。 */
export function normalizeTextScale(raw: unknown): TextScale {
  return typeof raw === "string" &&
    (TEXT_SCALES as readonly string[]).includes(raw)
    ? (raw as TextScale)
    : DEFAULT_TEXT_SCALE;
}

/**
 * :root へ流す CSS。**サーバーで `<style>` に入れる**。
 *
 * クライアントで当てると最初の描画だけ既定の大きさで出てから切り替わり、
 * 文字がひと呼吸おいて跳ねる。SSR で流し込めばその瞬間が無い（web と同じ）。
 *
 * 値は列挙から作った数値だけなので、`<` や `&` は入り得ない
 * （`<style>` の中身は生テキストで、React がエスケープすると壊れる）。
 */
export function textScaleRootCss(scale: TextScale): string {
  return `:root{--app-text-scale:${TEXT_SCALE_FACTORS[scale]}}`;
}
