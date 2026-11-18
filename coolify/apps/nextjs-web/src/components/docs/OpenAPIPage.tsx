"use client";

/**
 * OpenAPIPage.tsx — API / Webhook リファレンス（生成物）の描画部品。
 *
 * `content/manual/integration/reference/*.mdx` が `<OpenAPIPage …/>` を呼ぶ。
 * 文書そのものは `lib/openapi.ts` が渡すので、ここは見た目の設定だけ。
 *
 * ■ 「試す」（プレイグラウンド）は出さない
 * 公開マニュアルに資格情報の入力欄を置くと、トークンを貼る習慣を作る。
 * 試すなら curl か n8n の HTTP Request ノードで、ここは読む場所に徹する。
 * （`@scalar/api-client-react` も入れていないので、そもそも出せない。）
 */

import { createOpenAPIPage } from "fumadocs-openapi/ui";

export const OpenAPIPage = createOpenAPIPage({
  // 上の方針を**明示的に**切る。既定は true で、`@scalar/api-client-react` が
  // 無くても「Send」ボタンと Authorization の入力欄は出る（出ないと思い込んで
  // いたが、ページが実際に描けるようになって初めて見えた）。
  playground: { enabled: false },
  // 応答の型（TypeScript 定義の生成）は読み手に要らず、ビルドを重くする。
  generateTypeScriptDefinitions: false,
});
