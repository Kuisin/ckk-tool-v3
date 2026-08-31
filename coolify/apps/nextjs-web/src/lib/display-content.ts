/**
 * display-content.ts — 表示プロファイルの中身（content_config）の形。
 *
 * 種別ごとに形が違う JSON なので DB では検証できない。**境界で必ず通す**のが
 * ここ: 管理側の保存時と、ディスプレイへ返す直前の 2 か所。
 * 種別を増やすときは DISPLAY_CONTENT_TYPE（Prisma enum）とここを一緒に足す。
 *
 * 純粋な型・スキーマだけ。DB にも fetch にも触らない。
 *
 * ★ **nextjs-kiosk との twin file**（逐語コピー）。原本はこちら（nextjs-web）で、
 *   `pnpm twin:sync` で複製する。管理画面が保存する形とディスプレイが読む形が
 *   食い違うと、「保存はできるのに何も映らない」という最も原因の分かりにくい
 *   壊れ方をするので、1 バイトのずれも twin-files.test.ts で落とす。
 */

import { z } from "zod";
import {
  findDisplayTemplate,
  templateOptionsSchema,
} from "./display-templates";

/**
 * アプリ内の画面（テンプレート）。**どんな画面があり、どんな設定を持つかは
 * display-templates.ts の登録簿が唯一の正**で、ここはその宣言から検証を
 * 組み立てるだけ。画面を増やすとき、この形を触る必要は無い。
 */
export const appPageConfigSchema = z
  .object({ page: z.string(), options: z.unknown().optional() })
  .transform((value, ctx) => {
    const template = findDisplayTemplate(value.page);
    if (!template) {
      ctx.addIssue({
        code: "custom",
        message: "表示する画面を選んでください",
        path: ["page"],
      });
      return z.NEVER;
    }
    const parsed = templateOptionsSchema(template).safeParse(
      value.options ?? {},
    );
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        message:
          parsed.error.issues[0]?.message ?? "画面の設定が正しくありません",
        path: ["options"],
      });
      return z.NEVER;
    }
    return {
      page: template.key,
      options: parsed.data as Record<string, unknown>,
    };
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
