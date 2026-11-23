/**
 * openapi.ts — 外部 API の OpenAPI 文書を fumadocs-openapi に渡す入口。
 *
 * 文書の中身は `api-openapi.ts`（`api-resources.ts` と `webhook-core.ts` の
 * 登録簿から組み立てる）が唯一の定義元で、**ここは渡すだけ**。マニュアルの
 * 「連携 → リファレンス」はこの文書から生成される — コードを直せばマニュアルが
 * 追随する（`api-docs-sync.test.ts` が生成物のズレを CI で止める）。
 *
 * ■ 公開マニュアルに置く理由
 * 中身は口の一覧・引数・誤りの形・イベントの形で、秘密を含まない。
 * `GET /api/v1/openapi.json`（要認証）と同じ文書だが、連携を始める人が
 * **資格情報を得る前に**読むものなので、ログイン不要の /manual に置く。
 */

import { createOpenAPI } from "fumadocs-openapi/server";
import { buildOpenApiDocument } from "./api-openapi";

/** 生成物にバージョンを混ぜない（ビルドのたびに差分が出るため）。 */
export const DOCS_API_VERSION = "v1";

export const SCHEMA_ID = "ckk";

export const openapi = createOpenAPI({
  input: {
    [SCHEMA_ID]: () =>
      // biome-ignore lint/suspicious/noExplicitAny: 文書は api-openapi.ts が組む素の JSON
      buildOpenApiDocument(DOCS_API_VERSION) as any,
  },
  // ブラウザからの「試す」は出さない — 認証トークンを画面に貼らせない。
  disableCache: false,
});
