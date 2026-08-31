/**
 * app-env.ts — 実行環境の識別（dev / main）だけを持つ最小モジュール。
 *
 * app-flags.ts から切り出してある。あちらは Prisma と app-list を引くので、
 * proxy（Edge）・クライアント・dev-features.ts から読めない。環境の識別は
 * その手前で要るため、I/O を持たないこのファイルに置く。
 *
 * dev / main は同一 DB を共有するので、環境で分かれるものは必ずこの値をキーに含める。
 */

export type AppEnv = "dev" | "main";

export const APP_ENVS: AppEnv[] = ["dev", "main"];

/** この実行環境の識別子（APP_ENV。未設定はローカル＝dev 扱い）。 */
export function currentAppEnv(): AppEnv {
  return process.env.APP_ENV === "main" ? "main" : "dev";
}
