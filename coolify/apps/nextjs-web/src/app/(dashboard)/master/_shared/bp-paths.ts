/**
 * bp-paths.ts — 取引先マスタ (MS01) のパス定数。
 *
 * クライアント（一覧・フォーム・詳細）とサーバー（Server Actions の
 * revalidatePath）の両方が使うので、Prisma を引き込む bp-schema.ts とは分けて
 * おく — bp-schema を client component から import すると `@/lib/db` 経由で
 * node:module がブラウザ束に混ざってビルドが落ちる。
 */

export const BP_BASE_PATH = "/master/business-partners";

/** BP master 一覧・詳細で共有する再検証パス。 */
export const BP_PATHS = [BP_BASE_PATH];
