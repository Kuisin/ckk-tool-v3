/**
 * display-content.ts — 表示プロファイルの中身（content_config）の形。
 *
 * 種別ごとに形が違う JSON なので DB では検証できない。**境界で必ず通す**のが
 * ここ: 管理側の保存時と、ディスプレイへ返す直前の 2 か所。
 * 種別を増やすときは DISPLAY_CONTENT_TYPE（Prisma enum）とここを一緒に足す。
 *
 * 純粋な型・スキーマだけ。DB にも fetch にも触らないので nextjs-web からも
 * 同じ形で参照できる（今は逐語コピーではなく、各アプリが自分の zod で持つ）。
 */

import { z } from "zod";

/** アプリ内の表示専用ページ。増やすときはページ実装も一緒に足す。 */
export const DISPLAY_APP_PAGES = ["production"] as const;
export type DisplayAppPage = (typeof DISPLAY_APP_PAGES)[number];

export const appPageConfigSchema = z.object({
  page: z.enum(DISPLAY_APP_PAGES),
  /** 拠点で絞る（未指定 = 全拠点）。 */
  plantId: z.number().int().positive().nullish(),
  /** 作業場所で絞る（未指定 = 拠点内すべて）。 */
  workLocationId: z.number().int().positive().nullish(),
});

export const metabaseConfigSchema = z.object({
  dashboardId: z.number().int().positive(),
  /**
   * ダッシュボードの locked パラメータ。**サーバーが署名に入れる値**で、
   * ディスプレイからは触れない（触れると壁の画面から他拠点を覗ける）。
   */
  params: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});

export const urlConfigSchema = z.object({
  /** http(s) のみ。javascript: 等を弾くために protocol を明示検査する。 */
  url: z
    .string()
    .url()
    .refine(
      (v) => {
        try {
          const p = new URL(v).protocol;
          return p === "http:" || p === "https:";
        } catch {
          return false;
        }
      },
      { message: "http:// または https:// で始まる URL を入力してください" },
    ),
});

export const imageConfigSchema = z.object({
  /** files テーブルの id。表示は /api/display/image/[fileId] 経由。 */
  fileId: z.string().uuid(),
});

/** 種別 → スキーマ。保存時も配信時もこの 1 表を通す。 */
export const DISPLAY_CONTENT_SCHEMAS = {
  APP_PAGE: appPageConfigSchema,
  METABASE: metabaseConfigSchema,
  URL: urlConfigSchema,
  IMAGE: imageConfigSchema,
} as const;

export type DisplayContentType = keyof typeof DISPLAY_CONTENT_SCHEMAS;

export type AppPageConfig = z.infer<typeof appPageConfigSchema>;
export type MetabaseConfig = z.infer<typeof metabaseConfigSchema>;
export type UrlConfig = z.infer<typeof urlConfigSchema>;
export type ImageConfig = z.infer<typeof imageConfigSchema>;

export type DisplayContent =
  | { type: "APP_PAGE"; config: AppPageConfig }
  | { type: "METABASE"; config: MetabaseConfig }
  | { type: "URL"; config: UrlConfig }
  | { type: "IMAGE"; config: ImageConfig };

/**
 * DB から読んだ (種別, JSON) を検証して型付きの中身にする。
 * **壊れていたら null を返す**（例外にしない）— 設定が壊れているときに
 * 画面を真っ黒にするのではなく、「表示内容を確認してください」を出したい。
 */
export function parseDisplayContent(
  type: string,
  config: unknown,
): DisplayContent | null {
  const schema =
    DISPLAY_CONTENT_SCHEMAS[type as DisplayContentType] ?? undefined;
  if (!schema) return null;
  const parsed = schema.safeParse(config ?? {});
  if (!parsed.success) return null;
  return { type, config: parsed.data } as DisplayContent;
}
