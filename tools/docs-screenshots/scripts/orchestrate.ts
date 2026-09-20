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
 *   --only <id>   manifest の 1 エントリだけ撮影。カンマ区切りで複数指定可
 *                 （`--only a,b,c`）— playwright の -g へ選言として展開する。
 *   --locale <ja|en|zh>
 *                 撮影ユーザー（demo_shot・admin 撮影用の demo1）の表示言語。
 *                 既定 ja（省略時は今までどおり）。**アプリの再ビルド・再起動は
 *                 不要** — 言語は app.users.locale をリクエストごとに読むだけ
 *                 なので（i18n/request.ts）、DB の値を書き換えて撮り直すだけで
 *                 よい（このスクリプトが `seed()` の直後・`--reuse` の直前に
 *                 UPDATE する）。PNG のファイル名は ja だけ `<id>.png`
 *                 （既存 240 枚と後方互換）、en/zh は `<id>.en.png` /
 *                 `<id>.zh.png`（screenshots.spec.ts が env SHOT_LOCALE で判断）。
 *                 manifest.ts の `steps` 側で日本語の直書きセレクタを
 *                 `text(currentLocale(), "ns.key")`（i18n-text.ts）へ置き換えた
 *                 エントリだけが en/zh でも正しく要素を見つけられる —
 *                 未対応のエントリは en/zh では失敗しうる（既知の制約。
 *                 README 参照）。
 *   --verify      コミット済み PNG を上書きせず一時出力へ撮影し、pixelmatch で
 *                 比較（diff 比率 >= 0.1% で失敗）— 決定性の受け入れ確認。
 *                 committed 側に無い名前（初回の en/zh 撮影など）は警告して
 *                 スキップする（verify-diff.ts）。
 *   --skip-seed <file[,file]>
 *                 指定のデモシードを流さない（部分名一致）。データモデル変更に
 *                 追随できていないシードがあるとき、それに依存しない画面だけを
 *                 撮り直すための逃げ道。**既定では全て流す** — 依存する画面の
 *                 撮影は当然失敗するので、使ったらログに出る警告を読むこと。
 *
 * 前提: Docker / pnpm。psql・gunzip はコンテナ内で実行するので不要。
 *
 * 環境変数（既定のまま使えるが、**別のワークツリーが同時に撮っているときは
 * 4 つまとめて変える**。既定値のままだと相手の DB コンテナを消してしまう）:
 *   SHOT_DB_CONTAINER  使い捨て DB のコンテナ名（既定 ckk-shots-db）
 *   SHOT_DB_PORT       DB のホスト側ポート（既定 55432）
 *   SHOT_APP_PORT      nextjs-web のポート（既定 3100）
 *   SHOT_KIOSK_PORT    nextjs-kiosk のポート（既定 3101）
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = join(fileURLToPath(import.meta.url), "../..");
const REPO = resolve(HERE, "../..");
const SHARED_DB = join(REPO, "shared-db");
const NEXTJS_WEB = join(REPO, "coolify/apps/nextjs-web");
const NEXTJS_KIOSK = join(REPO, "coolify/apps/nextjs-kiosk");
const SHOT_DIR = join(NEXTJS_WEB, "content/manual/assets/screenshots");

const DB_PORT = Number(process.env.SHOT_DB_PORT ?? 55432);
const APP_PORT = Number(process.env.SHOT_APP_PORT ?? 3100);
const APP_URL = process.env.APP_URL ?? `http://localhost:${APP_PORT}`;
const KIOSK_PORT = Number(process.env.SHOT_KIOSK_PORT ?? 3101);
const KIOSK_URL = process.env.KIOSK_URL ?? `http://localhost:${KIOSK_PORT}`;
// 同じマシンで別のワークツリーが同時に撮っていることがある（この машина は
// ~20 個のワークツリーを抱えている）。ポートは既に環境変数で逃がせるのに
// コンテナ名だけ固定だったので、2 本目を動かすと 1 本目の DB を
// `docker rm -f` で消してしまう（後始末が名前だけで相手を決めるため）。
// 名前も逃がして、SHOT_* を揃えて渡せば完全に独立して回せるようにする。
const DB_CONTAINER = process.env.SHOT_DB_CONTAINER ?? "ckk-shots-db";
const DB_IMAGE = "groonga/pgroonga:4.0.6-alpine-17";
const DATABASE_URL = `postgresql://postgres:shots@127.0.0.1:${DB_PORT}/ckk`;
const AUTH_SECRET = "docs-screenshots-fixed-secret-not-production";
// フッターに出るバージョン。**固定しないと撮り直すたびに全画像が変わる** —
// 未設定だと AppFooter が "0.0.0" にフォールバックするので、撮る人の環境
// （.env の有無）で 200 枚超が一斉に差分になっていた。中身は撮影用の固定値。
const APP_VERSION = "0.1.0-local";

// import:legacy（BP マスタ）より前に流す基盤シード。
// 権限コード / 業務ロール / フィーチャーフラグ自体は migration が入れるので、
// ここに残すのは **撮影用 DB にしか居ないデモユーザー** 関連だけ。
// 順序が重要: demo-users を rbac より先に（rbac-seed の demo1〜5 ロール割当は
// ユーザーが既に居るときだけ効く — 逆順だと 1 回目と 2 回目で結果が変わる）。
const SEED_FILES_PRE = [
  // 本番には入れないマスタ（素材 / 拠点 / 不良種類 / 承認フロー）。
  // 材種・工程マスタ・価格試算設定・RBAC・フラグは migration が入れる。
  "sql/extended-master-seed.sql",
  "sql/demo-users-seed.sql",
  "sql/rbac-seed.sql", // デモユーザーへのロール割当（権限定義そのものは migration）
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
  // キオスク撮影用の端末（既知トークン）+ カード（PIN 4321・demo_shot 割当）。
  // 拠点 F01（masters-demo）とユーザー demo_shot が先に要るので最後。
  "sql/kiosk-shot-seed.sql",
];

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const flagValue = (f: string): string | undefined => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

// ── ロケール ──────────────────────────────────────────────────────────────────
// アプリの言語は URL ではなく app.users.locale（ログイン中ユーザーの設定）で
// 決まる（i18n/request.ts）。next-intl のリクエスト設定は毎リクエスト DB を
// 読むので、**アプリの再ビルド・再起動は要らない** — DB の値を書き換えて
// 撮り直すだけで ja/en/zh を切り替えられる。
//
// PNG のファイル名は ja だけ従来どおり `<id>.png`（コミット済み 240 枚との
// 後方互換）、en/zh は `<id>.en.png` / `<id>.zh.png`（screenshots.spec.ts が
// env SHOT_LOCALE を見て決める）。
const LOCALES = ["ja", "en", "zh"] as const;
type Locale = (typeof LOCALES)[number];
const LOCALE = (flagValue("--locale") ?? "ja") as Locale;
if (!LOCALES.includes(LOCALE)) {
  throw new Error(`--locale must be one of ${LOCALES.join("/")}, got "${LOCALE}"`);
}

/**
 * 撮影用ユーザー（demo_shot / admin 撮影用の demo1）の表示言語を切り替える。
 * DB が起動していればいつでも呼べる（アプリの再起動は不要）。
 */
function setLocale(): void {
  log(`locale: ${LOCALE} (demo_shot, demo1)`);
  psqlInput(
    `UPDATE app.users SET locale = '${LOCALE}' WHERE username IN ('demo_shot', 'demo1');`,
  );
}

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

function seed(): void {
  if (!existsSync(join(SHARED_DB, "node_modules"))) {
    log("installing shared-db deps (first run)");
    // --ignore-workspace が要る: shared-db はルートの pnpm workspace の
    // メンバーではないので、付けないと pnpm がルートまで登って**ルートの**
    // 依存を入れ、shared-db/node_modules は空のまま次の prisma が落ちる
    // （node_modules を持たない新しいワークツリーで必ず起きる）。
    sh("pnpm", ["install", "--frozen-lockfile", "--ignore-workspace"], {
      cwd: SHARED_DB,
    });
  }
  // ベースライン（2026-08-24 のスクウォッシュ）は directory.* も作り、初期マスタ /
  // RBAC / フィーチャーフラグも migration として入るので、directory-bootstrap も
  // P3005 回避（空の _prisma_migrations 手動作成）もシード流しも要らない。
  log("prisma migrate deploy");
  sh("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: SHARED_DB,
    env: { DATABASE_URL },
  });
  for (const f of SEED_FILES_PRE) {
    log(`seed: ${f}`);
    psqlFile(join(SHARED_DB, f));
  }
  const importsDir = join(REPO, "tools/data-migration/imports");
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
  const skips = (flagValue("--skip-seed") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const f of SEED_FILES_POST) {
    if (skips.some((s) => f.includes(s))) {
      log(`seed: ${f} — SKIPPED (--skip-seed). このシードに依存する画面は撮れない`);
      continue;
    }
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
    env: { ...process.env, DATABASE_URL, NEXT_PUBLIC_APP_VERSION: APP_VERSION },
    stdio: "inherit",
  });
}

/**
 * キオスク（現場タブレット）アプリのビルド・起動。
 * 別アプリ・別ポートだが DB は同じ使い捨て DB を見る。
 * KIOSK_ATTESTATION は設定しない（設定すると Android ラッパー以外は弾かれる）。
 */
function buildKiosk(): void {
  log("next build (kiosk)");
  execFileSync("pnpm", ["run", "build"], {
    cwd: NEXTJS_KIOSK,
    env: { ...process.env, DATABASE_URL, NEXT_PUBLIC_APP_VERSION: APP_VERSION },
    stdio: "inherit",
  });
}

let kioskProc: ChildProcess | null = null;

async function startKiosk(): Promise<void> {
  log(`kiosk server on :${KIOSK_PORT}`);
  kioskProc = spawn("pnpm", ["run", "start"], {
    cwd: NEXTJS_KIOSK,
    env: {
      ...process.env,
      DATABASE_URL,
      NODE_ENV: "production",
      PORT: String(KIOSK_PORT),
      KIOSK_WS_SECRET: "docs-screenshots-fixed-ws-secret",
    },
    stdio: "inherit",
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${KIOSK_URL}/api/healthz`);
      if (res.ok) {
        log("kiosk is up");
        return;
      }
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error("kiosk did not become ready in 60s");
}

function stopKiosk(): void {
  if (kioskProc && !kioskProc.killed) {
    kioskProc.kill("SIGTERM");
    log("kiosk stopped");
  }
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
  // Playwright の -g はテスト名だけでなく前置き（プロジェクト名 › ファイル名 ›）
  // を含めた文字列に当たるため、`^id$` だと 1 件も一致しない（--only が黙って
  // 「No tests found」で落ちていた）。id は manifest 内で一意なので、末尾一致で
  // 十分に絞れる。
  // カンマ区切りで複数 id も受ける（例: en/zh のパイロット撮影を 1 回の
  // playwright 起動でまとめて撮る）— `(id1|id2|...)$` の選言に展開する。
  if (only) {
    const ids = only.split(",").map((s) => s.trim()).filter(Boolean);
    const pattern = ids.length > 1 ? `(${ids.join("|")})$` : `${ids[0]}$`;
    pwArgs.push("-g", pattern);
  }
  log(only ? `capturing only: ${only}` : "capturing all manifest entries");
  execFileSync("pnpm", pwArgs, {
    cwd: HERE,
    env: {
      ...process.env,
      APP_URL,
      KIOSK_URL,
      SHOT_LOCALE: LOCALE,
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
    setLocale();
    log(`DB left running — DATABASE_URL=${DATABASE_URL}`);
    log(`stop it with: docker rm -f ${DB_CONTAINER}`);
    return;
  }

  if (reuse) {
    // DB は起動済みスタック側にある前提（--seed-only で残したもの）。
    // ロケールはアプリ再起動なしで切り替えられるので、撮り直しのたびに
    // 上書きするだけでよい。
    setLocale();
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
    setLocale();
    buildApp();
    await startApp();
    // キオスク（現場タブレット）マニュアル用。--no-kiosk で省略できる
    // （web だけ撮り直したいときはビルド 1 本ぶん速い）。
    if (!flag("--no-kiosk")) {
      buildKiosk();
      await startKiosk();
    }
    if (flag("--verify")) await verify();
    else {
      capture();
      lint();
    }
  } finally {
    stopKiosk();
    stopApp();
    stopDb();
  }
}

main().catch((e) => {
  console.error(e);
  stopKiosk();
  stopApp();
  stopDb();
  process.exit(1);
});
