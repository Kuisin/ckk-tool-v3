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
import {
  type DisplayTemplateOptions,
  findDisplayTemplate,
  optionPlantId,
  templateOptionsSchema,
} from "@/lib/display-templates";

export type BoardContext = {
  options: DisplayTemplateOptions;
  /** 設定の拠点 → 無ければこのディスプレイの拠点。 */
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
  const auth = await getDisplay();
  if (!auth.ok) return null;

  const template = findDisplayTemplate(templateKey);
  if (!template) notFound();

  const params = await searchParams;
  const raw = params.opt;
  const decoded = decodeOptions(Array.isArray(raw) ? raw[0] : raw);
  const parsed = templateOptionsSchema(template).safeParse(decoded ?? {});
  const options: DisplayTemplateOptions = parsed.success
    ? (parsed.data as DisplayTemplateOptions)
    : {};

  return {
    options,
    // 設定で拠点を決めていない画面でも、その端末の拠点ぶんは自然に絞れる
    plantId: optionPlantId(options) ?? auth.display.plantId ?? null,
  };
}

/** 未登録のときにフレーム内へ出す文言（黒画面を出さない）。 */
export const NOT_REGISTERED = "この画面は登録されていません。";
