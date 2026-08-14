/**
 * orchestrate.ts — スクリーンショット撮影の一括オーケストレーション。
 *
 * フロー（既定 = docs:shots）:
 *   1. ローカル一時 Postgres（groonga/pgroonga, tmpfs, :55432）を起動
 *   2. shared-db の migrate deploy + シード SQL + レガシー import を適用
 *   3. nextjs-web を production build → :3100 で起動
 *   4. Playwright で manifest を撮影 → lint
 *   5. 全て破棄（コンテナ削除・アプリ停止）— 共有 dev DB には一切触れない
 *
 * フラグ:
 *   --seed-only   1–2 だけ実行し、DB を起動したまま終了（手動確認用）
 *   --reuse       1–3 をスキップ（APP_URL の起動済みスタックに対して撮影）
 *   --only <id>   manifest の 1 エントリだけ撮影
 *   --verify      コミット済み PNG を上書きせず一時出力へ撮影し、pixelmatch で
 *                 比較（diff 比率 >= 0.1% で失敗）— 決定性の受け入れ確認
 *
 * 前提: Docker / pnpm。psql・gunzip はコンテナ内で実行するので不要。
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = join(fileURLToPath(import.meta.url), "../..");
const REPO = resolve(HERE, "../..");
const SHARED_DB = join(REPO, "shared-db");
const NEXTJS_WEB = join(REPO, "docker-compose/nextjs-web");
const SHOT_DIR = join(NEXTJS_WEB, "content/manual/assets/screenshots");

const DB_PORT = Number(process.env.SHOT_DB_PORT ?? 55432);
const APP_PORT = Number(process.env.SHOT_APP_PORT ?? 3100);
const APP_URL = process.env.APP_URL ?? `http://localhost:${APP_PORT}`;
const DB_CONTAINER = "ckk-shots-db";
const DB_IMAGE = "groonga/pgroonga:4.0.6-alpine-17";
const DATABASE_URL = `postgresql://postgres:shots@127.0.0.1:${DB_PORT}/ckk`;
const AUTH_SECRET = "docs-screenshots-fixed-secret-not-production";

// import:legacy（BP マスタ）より前に流す基盤シード。
// 順序が重要: demo-users を rbac より先に（rbac-seed の demo1〜5 ロール割当は
// ユーザーが既に居るときだけ効く — 逆順だと 1 回目と 2 回目で結果が変わる）。
const SEED_FILES_PRE = [
  "sql/demo-users-seed.sql",
  "sql/rbac-seed.sql",
  "sql/roles-seed.sql",
  "sql/feature-flags-seed.sql",
  "sql/dev-role-users-seed.sql",
  "sql/screenshot-user-seed.sql",
];
// BP マスタ前提のデモデータ。
// kiosk-steps-demo-seed は既存の order_acceptances（実運用データ）前提のため
// まっさらな DB では流せない — 受注〜指示書チェーンのシードが将来できたら追加。
// 順序が重要: sales（デモ顧客/製品/販売伝票）→ masters（架空仕入先/拠点/保管・
// 作業場所/検査テンプレート）→ purchase（購買依頼/発注/入荷 — BP-90003/90004 前提）
// → production（受注→指示書チェーン/在庫 — BP-90004・F01 前提）→ shipping-billing
// （出荷/納品/請求/締日 — production の sales_orders 前提）。
const SEED_FILES_POST = [
  "sql/manufacturing-demo-seed.sql",
  "sql/audit-demo-seed.sql",
  "sql/sales-demo-seed.sql",
  "sql/masters-demo-seed.sql",
  "sql/purchase-demo-seed.sql",
  "sql/production-demo-seed.sql",
  "sql/shipping-billing-demo-seed.sql",
  "sql/system-demo-seed.sql",
];

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const flagValue = (f: string): string | undefined => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

function sh(cmd: string, cmdArgs: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; input?: Buffer } = {}): string {
  return execFileSync(cmd, cmdArgs, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    input: opts.input,
    stdio: opts.input ? ["pipe", "pipe", "inherit"] : ["ignore", "pipe", "inherit"],
    encoding: undefined,
  }) as unknown as string;
}

function log(msg: string): void {
  console.log(`\x1b[36m[shots]\x1b[0m ${msg}`);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

// ── 1. ephemeral DB ──────────────────────────────────────────────────────────

function containerRunning(): boolean {
  try {
    const out = sh("docker", ["ps", "-q", "-f", `name=^${DB_CONTAINER}$`]);
    return out.toString().trim() !== "";
  } catch {
    return false;
  }
}

async function startDb(): Promise<void> {
  if (containerRunning()) {
    log(`DB container ${DB_CONTAINER} already running — reusing`);
    return;
  }
  log(`starting ${DB_IMAGE} on :${DB_PORT} (tmpfs, throwaway)`);
  sh("docker", [
    "run", "-d", "--rm",
    "--name", DB_CONTAINER,
    "-p", `${DB_PORT}:5432`,
    "--tmpfs", "/var/lib/postgresql/data",
    "-e", "POSTGRES_PASSWORD=shots",
    "-e", "POSTGRES_DB=ckk",
    DB_IMAGE,
  ]);
  for (let i = 0; i < 60; i++) {
    try {
      sh("docker", ["exec", DB_CONTAINER, "pg_isready", "-U", "postgres", "-d", "ckk"]);
      log("postgres is ready");
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("postgres did not become ready in 60s");
}

function stopDb(): void {
  try {
    sh("docker", ["rm", "-f", DB_CONTAINER]);
    log("DB container removed");
  } catch {
    /* already gone */
  }
}

// ── 2. migrate + seed ────────────────────────────────────────────────────────

function psqlFile(path: string): void {
  psqlInput(readFileSync(path));
}

function psqlInput(sql: Buffer | string): void {
  sh(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "ckk", "-v", "ON_ERROR_STOP=1", "-q"],
    { input: Buffer.isBuffer(sql) ? sql : Buffer.from(sql) },
  );
}

/**
 * directory-bootstrap で DB が「空でない」状態になると prisma migrate deploy が
 * P3005 で拒否する。一時 DB 専用の回避: 空の _prisma_migrations を先に作って
 * おく（deploy は履歴テーブルがあれば未適用 migration を全部流すだけになる）。
 */
const PRISMA_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS _prisma_migrations (
  id                  varchar(36)  PRIMARY KEY,
  checksum            varchar(64)  NOT NULL,
  finished_at         timestamptz,
  migration_name      varchar(255) NOT NULL,
  logs                text,
  rolled_back_at      timestamptz,
  started_at          timestamptz  NOT NULL DEFAULT now(),
  applied_steps_count integer      NOT NULL DEFAULT 0
);`;

function seed(): void {
  if (!existsSync(join(SHARED_DB, "node_modules"))) {
    log("installing shared-db deps (first run)");
    sh("pnpm", ["install", "--frozen-lockfile"], { cwd: SHARED_DB });
  }
  // directory.* は ldap-sync 所有で migration は ALTER しかしない —
  // まっさらな DB では先に土台を作る（冪等）。
  log("bootstrap: sql/directory-bootstrap.sql");
  psqlInput(PRISMA_MIGRATIONS_TABLE);
  psqlFile(join(SHARED_DB, "sql/directory-bootstrap.sql"));
  log("prisma migrate deploy");
  sh("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: SHARED_DB,
    env: { DATABASE_URL },
  });
  for (const f of SEED_FILES_PRE) {
    log(`seed: ${f}`);
    psqlFile(join(SHARED_DB, f));
  }
  const importsDir = join(REPO, "data-migration/imports");
  if (existsSync(importsDir)) {
    // 999_audit_backfill は旧スキーマ前提（e.base_unit_price）で新規 DB では
    // 落ちる + 撮影に不要なのでスキップ。マスタ import（010_bp 等）だけ流す。
    for (const f of sh("ls", [importsDir])
      .toString()
      .trim()
      .split("\n")
      .filter((n) => n.endsWith(".sql.gz") && !n.startsWith("999_"))
      .sort()) {
      log(`legacy import: ${f}`);
      const gunzipped = execFileSync("gunzip", ["-c", join(importsDir, f)], { maxBuffer: 256 * 1024 * 1024 });
      psqlInput(gunzipped);
    }
  }
  for (const f of SEED_FILES_POST) {
    log(`seed: ${f}`);
    psqlFile(join(SHARED_DB, f));
  }
  log("seeding complete");
}

// ── 3. app build + start ─────────────────────────────────────────────────────

function buildApp(): void {
  // 新規撮影を足した初回は「本文が参照 / PNG は未撮影」でビルドが落ちるため、
  // 先に不足分のプレースホルダを置く（撮影で実物に上書きされる）。
  log("placeholders for uncaptured shots");
  execFileSync("pnpm", ["exec", "tsx", "scripts/placeholders.ts"], {
    cwd: HERE,
    stdio: "inherit",
  });
  log("next build (production)");
  execFileSync("pnpm", ["run", "build"], {
    cwd: NEXTJS_WEB,
    env: { ...process.env, DATABASE_URL },
    stdio: "inherit",
  });
}

let appProc: ChildProcess | null = null;

async function startApp(): Promise<void> {
  log(`next start on :${APP_PORT}`);
  appProc = spawn("pnpm", ["exec", "next", "start", "-p", String(APP_PORT)], {
    cwd: NEXTJS_WEB,
    env: {
      ...process.env,
      DATABASE_URL,
      AUTH_SECRET,
      AUTH_URL: APP_URL,
      NODE_ENV: "production",
      // 本番相当の見た目で撮る: 開発環境バー非表示 + リリース済みアプリのみ表示
      APP_ENV: "main",
    },
    stdio: "inherit",
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${APP_URL}/login`);
      if (res.ok) {
        log("app is up");
        return;
      }
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error("app did not become ready in 60s");
}

function stopApp(): void {
  if (appProc && !appProc.killed) {
    appProc.kill("SIGTERM");
    log("app stopped");
  }
}

// ── 4. capture / verify / lint ───────────────────────────────────────────────

function capture(outDir?: string): void {
  const only = flagValue("--only");
  const pwArgs = ["exec", "playwright", "test"];
  if (only) pwArgs.push("-g", `^${only}$`);
  log(only ? `capturing only: ${only}` : "capturing all manifest entries");
  execFileSync("pnpm", pwArgs, {
    cwd: HERE,
    env: {
      ...process.env,
      APP_URL,
      ...(outDir ? { PW_OUT_DIR: outDir } : {}),
    },
    stdio: "inherit",
  });
}

async function verify(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), "ckk-shots-verify-"));
  capture(tmp);
  log("comparing against committed PNGs (threshold 0.1%)");
  execFileSync("pnpm", ["exec", "tsx", "scripts/verify-diff.ts", SHOT_DIR, tmp], {
    cwd: HERE,
    stdio: "inherit",
  });
}

function lint(): void {
  execFileSync("pnpm", ["exec", "tsx", "scripts/lint-screenshots.ts"], {
    cwd: HERE,
    stdio: "inherit",
  });
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const reuse = flag("--reuse");
  const seedOnly = flag("--seed-only");

  if (seedOnly) {
    await startDb();
    seed();
    log(`DB left running — DATABASE_URL=${DATABASE_URL}`);
    log(`stop it with: docker rm -f ${DB_CONTAINER}`);
    return;
  }

  if (reuse) {
    if (flag("--verify")) await verify();
    else {
      capture();
      lint();
    }
    return;
  }

  try {
    await startDb();
    seed();
    buildApp();
    await startApp();
    if (flag("--verify")) await verify();
    else {
      capture();
      lint();
    }
  } finally {
    stopApp();
    stopDb();
  }
}

main().catch((e) => {
  console.error(e);
  stopApp();
  stopDb();
  process.exit(1);
});
