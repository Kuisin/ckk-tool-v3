import "server-only";

/**
 * schema-readiness.ts — このコードが要求するマイグレーションが DB に当たって
 * いるかを見る（デプロイとマイグレーションの順序を無関係にするための土台）。
 *
 * ## なぜ要るか
 *
 * 2 つの向きで危険度が違う:
 *   - **スキーマが先・アプリが後** … 安全。古い Prisma Client は新しい列を
 *     SELECT しないので、増えた列は無視されるだけ。
 *   - **アプリが先・スキーマが後** … **壊れる。** 新しい Client は存在しない列を
 *     SELECT し、その画面が 500 になる（実際に設計依頼で起きた）。
 *
 * なので「アプリ側がスキーマの準備を待つ」ようにすれば、どちらの順序で来ても
 * 壊れなくなる。この判定を healthcheck に出し、準備できるまで新しいコンテナを
 * 公開しない（旧コンテナが serving を続けるので無停止）。
 *
 * ## 要求リストの作り方
 *
 * イメージのビルド時に `shared-db/prisma/migrations` のディレクトリ名を
 * 書き出しておく（Dockerfile 参照）。**そのイメージが前提にしているスキーマ**が
 * そのまま要求リストになるので、列を足すたびにここを直す必要はない。
 *
 * ファイルが無い環境（`next dev` など）は「要求なし」= 常に ready。開発の
 * 邪魔をしないため。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";

/** ビルド時に書き出す要求マイグレーション一覧（1 行 1 ディレクトリ名）。 */
const MANIFEST_PATH =
  process.env.REQUIRED_MIGRATIONS_FILE ??
  path.join(process.cwd(), "required-migrations.txt");

export interface SchemaReadiness {
  ready: boolean;
  /** まだ当たっていないマイグレーション（新しい順に効いてくるので名前順）。 */
  missing: string[];
  /** 要求リストの件数（0 = マニフェスト無し → 判定しない）。 */
  required: number;
  /** DB を引けなかったときの理由（ready=false）。 */
  error?: string;
}

/** 要求リスト。読めなければ空（＝判定しない）。 */
async function readRequired(): Promise<string[]> {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

/**
 * いま DB に当たっているか。
 *
 * `rolled_back_at` が入っている行は「当たっていない」扱い（失敗して戻された
 * もの）。`finished_at` が null のものも同様で、これは適用途中か失敗のどちらか。
 */
export async function checkSchemaReadiness(): Promise<SchemaReadiness> {
  const required = await readRequired();
  if (required.length === 0) {
    return { ready: true, missing: [], required: 0 };
  }
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const applied = new Set(rows.map((r) => r.migration_name));
    const missing = required.filter((m) => !applied.has(m)).sort();
    return { ready: missing.length === 0, missing, required: required.length };
  } catch (e) {
    // DB がまだ立ち上がっていない・接続できない — これも「準備できていない」。
    return {
      ready: false,
      missing: [],
      required: required.length,
      error: e instanceof Error ? e.message : "database unreachable",
    };
  }
}
