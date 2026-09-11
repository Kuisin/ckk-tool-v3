/**
 * GET /api/v1/openapi.json — この口の契約（OpenAPI 3.1）。
 *
 * **認証を要る**ようにしてある。中身は口の一覧と必要な権限で、未認証の相手に
 * 構造を配る理由が無い（`/health` と違い、これは呼び出し側が資格情報を
 * 持ってから読むもの）。
 *
 * 文書は `lib/api-resources.ts` の登録簿から組み立てる — 手書きの文書を
 * 別に持たない（2 つ書けば必ず離れる）。
 */

import { requireApiAuth } from "@/lib/api-authz";
import { buildOpenApiDocument } from "@/lib/api-openapi";
import { jsonOk } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const gate = await requireApiAuth(request);
  if (!gate.ok) return gate.response;

  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
  return jsonOk(buildOpenApiDocument(version));
}
