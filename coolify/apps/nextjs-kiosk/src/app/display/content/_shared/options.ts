import "server-only";

/**
 * options.ts — テンプレートページ共通の入口処理。
 *
 * DisplayRenderer は `?opt=<base64url(JSON)>` で設定を渡す。ページごとに
 * クエリの読み方を書くと必ずずれるので、ここ 1 か所に寄せる。
 *
 * **設定はサーバー側で必ず検証し直す**（登録簿の zod を通す）。フレームの
 * URL は同一オリジンとはいえクライアントから触れるので、そのまま信じない。
 */

import { notFound } from "next/navigation";
import { getDisplay } from "@/lib/display-auth";
import { normalizeScreenIndex } from "@/lib/display-core";
import {
  type DisplayTemplateOptions,
  findDisplayTemplate,
  optionPlantId,
  templateOptionsSchema,
} from "@/lib/display-templates";

export type BoardContext = {
  options: DisplayTemplateOptions;
  /**
   * 絞り込む拠点。**null = 全拠点**。
   *
   * 以前はここでディスプレイ自身の拠点へ落としていたが、「拠点で絞る」を
   * 空にした人が求めているのは全社の状況で、その画面が置かれている拠点では
   * ない。空欄が「全部」ではなく「ここだけ」になっていると、絞っていない
   * つもりの画面に一部しか出ず、しかも理由が画面から読み取れない。
   */
  plantId: number | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

function decodeOptions(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/**
 * ディスプレイの認証 + 設定の解決。未登録なら null（呼び出し側が案内を出す）。
 * テンプレートが未知なら 404 にする（URL を手で叩かれたとき）。
 */
export async function boardContext(
  templateKey: string,
  searchParams: Promise<SearchParams>,
): Promise<BoardContext | null> {
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  // **この窓（画面）の Cookie で引く。** 同じブラウザで 2 画面を出している
  // ときに、どちらの中身かを取り違えないため。
  const auth = await getDisplay(normalizeScreenIndex(one("screen")));
  if (!auth.ok) return null;

  const template = findDisplayTemplate(templateKey);
  if (!template) notFound();

  const raw = params.opt;
  const decoded = decodeOptions(Array.isArray(raw) ? raw[0] : raw);
  const parsed = templateOptionsSchema(template).safeParse(decoded ?? {});
  const options: DisplayTemplateOptions = parsed.success
    ? (parsed.data as DisplayTemplateOptions)
    : {};

  return {
    options,
    // 未選択は全拠点。ディスプレイの拠点へは落とさない（上の注記）。
    plantId: optionPlantId(options),
  };
}

/** 未登録のときにフレーム内へ出す文言（黒画面を出さない）。 */
export const NOT_REGISTERED = "この画面は登録されていません。";
