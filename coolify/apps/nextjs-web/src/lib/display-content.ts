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
 *
 * ★ バリデーションメッセージは呼び出し側から渡す関数 `t` で解決する
 *   （twin file は next-intl（web）もキオスクの辞書（kiosk）も読み込めない）。
 *   実際に文言を読むのは web の保存フォーム（settings/kiosk-devices/
 *   displays/actions.ts）だけ——kiosk の parseDisplayContent は成否しか
 *   見ないので、そちら側は素通しの t で十分。
 */

import { z } from "zod";
import {
  findDisplayTemplate,
  templateOptionsSchema,
} from "./display-templates";

/** 呼び出し側の言語で文言を解決する関数。既定値は t が無いときの ja 直書き。 */
export type DisplayContentT = (key: string, fallback: string) => string;

const identityT: DisplayContentT = (_key, fallback) => fallback;

/**
 * アプリ内の画面（テンプレート）。**どんな画面があり、どんな設定を持つかは
 * display-templates.ts の登録簿が唯一の正**で、ここはその宣言から検証を
 * 組み立てるだけ。画面を増やすとき、この形を触る必要は無い。
 */
export function appPageConfigSchema(t: DisplayContentT = identityT) {
  return z
    .object({ page: z.string(), options: z.unknown().optional() })
    .transform((value, ctx) => {
      const template = findDisplayTemplate(value.page);
      if (!template) {
        ctx.addIssue({
          code: "custom",
          message: t(
            "displayContent.selectAPageToShow",
            "表示する画面を選んでください",
          ),
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
            parsed.error.issues[0]?.message ??
            t(
              "displayContent.pageSettingsAreIncorrect",
              "画面の設定が正しくありません",
            ),
          path: ["options"],
        });
        return z.NEVER;
      }
      return {
        page: template.key,
        options: parsed.data as Record<string, unknown>,
      };
    });
}

export const metabaseConfigSchema = z.object({
  dashboardId: z.number().int().positive(),
  /**
   * ダッシュボードの locked パラメータ。**サーバーが署名に入れる値**で、
   * ディスプレイからは触れない（触れると壁の画面から他拠点を覗ける）。
   */
  params: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});

export function urlConfigSchema(t: DisplayContentT = identityT) {
  return z.object({
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
        {
          message: t(
            "displayContent.enterUrlStartingWithHttp",
            "http:// または https:// で始まる URL を入力してください",
          ),
        },
      ),
  });
}

/**
 * 画像の収め方。テレビと画像の縦横比はまず一致しないので、**どう妥協するかを
 * 選べないと必ずどれかが不満**になる（余白が出る / 端が切れる / 歪む）。
 * 値は CSS の object-fit そのままで、描画側は当てるだけ。
 */
export const IMAGE_FITS = ["contain", "cover", "fill"] as const;
export type ImageFit = (typeof IMAGE_FITS)[number];

export const imageConfigSchema = z.object({
  /** files テーブルの id。表示は /api/display/image/[fileId] 経由。 */
  fileId: z.string().uuid(),
  /**
   * 既定は contain（全体を表示）。**切れるより余白のほうが安全** —
   * 掲示物は端に日付や連絡先が入っていることが多く、cover を既定にすると
   * それが黙って切り落とされる。
   */
  fit: z.enum(IMAGE_FITS).catch("contain"),
});

/** 種別 → スキーマ。保存時も配信時もこの 1 表を通す。 */
export function displayContentSchemas(t: DisplayContentT = identityT) {
  return {
    APP_PAGE: appPageConfigSchema(t),
    METABASE: metabaseConfigSchema,
    URL: urlConfigSchema(t),
    IMAGE: imageConfigSchema,
  } as const;
}

/** 後方互換のための ja 固定版（呼び出し側を更新し切るまでの橋渡し）。 */
export const DISPLAY_CONTENT_SCHEMAS = displayContentSchemas();

export type DisplayContentType = keyof ReturnType<typeof displayContentSchemas>;

export type AppPageConfig = z.infer<ReturnType<typeof appPageConfigSchema>>;
export type MetabaseConfig = z.infer<typeof metabaseConfigSchema>;
export type UrlConfig = z.infer<ReturnType<typeof urlConfigSchema>>;
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
