/**
 * POST /api/ai/keywords — マスタ 1 件のキーワード候補を AI に作らせる。
 *
 * 製品（MS04）・素材（MS06）のフォームにある「AI で候補を出す」から呼ぶ。
 * 画面が持っている入力値（名称・コード・属性）をそのまま渡し、po-extract の
 * 補助タスク `/generate/keywords` に投げるだけ — **保存はしない**。返した候補を
 * 採用するかは人が決め、採用した語だけがフォーム経由で match_names に入る。
 *
 * Server Action ではなく Route Handler なのは、数十秒かかる外部呼び出しで
 * maxDuration を自分で決めたいから（フォーム送信とは別系統にしておく）。
 *
 * 応答: { ok: true, keywords: string[] }（登録済みの語は除いてある）/
 *       { ok: false, error }（400 / 401 / 403 / 502）。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/lib/authz";
import {
  KEYWORD_MAX_COUNT,
  KEYWORD_MAX_LENGTH,
  newKeywords,
} from "@/lib/master-keywords";
import { generateJson, PoExtractError } from "@/lib/po-extract";

export const dynamic = "force-dynamic";
// po-extract 側の待ち上限（既定 3 分）に合わせる。
export const maxDuration = 200;

const bodySchema = z.object({
  kind: z.enum(["product", "material"]),
  name: z.string().trim().min(1, "名称を入力してから実行してください"),
  code: z.string().trim().max(64).nullish(),
  /** 画面に出ている項目（材種・寸法・単位・備考など）。ラベルごと渡す。 */
  attributes: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(64),
        value: z.string().trim().min(1).max(400),
      }),
    )
    .max(40)
    .default([]),
  /** すでに登録されているキーワード（重複を出させないため）。 */
  existing: z
    .array(z.string().trim().max(KEYWORD_MAX_LENGTH))
    .max(KEYWORD_MAX_COUNT)
    .default([]),
});

/** po-extract `/generate/keywords` の応答（スキーマ拘束済み）。 */
interface KeywordsResult {
  keywords?: unknown;
}

function bad(error: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  // マスタを作る人・直す人のための道具。どちらかの権限があれば使える。
  const [create, update] = await Promise.all([
    checkPermission("master", "CREATE"),
    checkPermission("master", "UPDATE"),
  ]);
  if (!(create.ok || update.ok)) {
    const error = create.ok ? update.error : create.error;
    return bad(error, error.startsWith("ログイン") ? 401 : 403);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return bad("JSON で送信してください");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return bad(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const input = parsed.data;

  try {
    const result = await generateJson<KeywordsResult>("keywords", {
      kind: input.kind,
      name: input.name,
      code: input.code ?? null,
      attributes: input.attributes,
      existing: input.existing,
    });
    const raw = Array.isArray(result.keywords)
      ? result.keywords.filter((v): v is string => typeof v === "string")
      : [];
    return NextResponse.json({
      ok: true,
      keywords: newKeywords(raw, input.existing),
    });
  } catch (e) {
    if (e instanceof PoExtractError) return bad(e.message, 502);
    console.error("[ai/keywords]", e);
    return bad("候補の生成に失敗しました", 502);
  }
}
